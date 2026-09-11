import { formatUnits } from 'viem'
import {
    fetchIncentives,
    fetchPoolMetrics,
    fetchV3TokenSnapshots,
    fetchV3Tokens,
    type IncentiveRow,
    type PonderClient,
    type PoolMetrics,
    type V3TokenPrice,
} from '@coshi190/juno-moneta-sdk'

const SECONDS_PER_DAY = 86400
const DAYS_PER_YEAR = 365

export type IncentiveStatus = 'pending' | 'active' | 'ended'

export interface IncentiveMetrics {
    incentiveId: string
    status: IncentiveStatus
    pool: string
    poolLabel: string
    rewardToken: string
    rewardSymbol: string
    startTime: number
    endTime: number
    durationDays: number
    remainingDays: number
    progressPercent: number
    reward: number
    rewardPerDay: number
    distributedReward: number
    remainingReward: number
    rewardUsd: number | null
    rewardUsdPerDay: number | null
    poolTvlUsd: number | null
    volume1dUsd: number | null
    feeAprPercent: number | null
    rewardAprPoolTvlPercent: number | null
}

export interface IncentiveTotals {
    programs: number
    pending: number
    active: number
    ended: number
    totalRewardUsd: number | null
    activeRewardUsdPerDay: number | null
}

export interface IncentiveAnalytics {
    totals: IncentiveTotals
    programs: IncentiveMetrics[]
}

function incentiveStatus(incentive: IncentiveRow, nowSeconds: number): IncentiveStatus {
    if (nowSeconds < incentive.startTime) return 'pending'
    if (nowSeconds >= incentive.endTime) return 'ended'
    return 'active'
}

function poolLabel(pool: PoolMetrics | undefined, address: string): string {
    if (!pool) return address
    return `${pool.token0.symbol}/${pool.token1.symbol} ${pool.fee / 10_000}%`
}

function computeIncentiveMetrics({
    incentive,
    nowSeconds,
    rewardDecimals,
    rewardSymbol,
    rewardPriceUsd,
    pool,
}: {
    incentive: IncentiveRow
    nowSeconds: number
    rewardDecimals: number
    rewardSymbol: string
    rewardPriceUsd: number | null
    pool: PoolMetrics | undefined
}): IncentiveMetrics {
    const status = incentiveStatus(incentive, nowSeconds)
    const duration = Math.max(1, incentive.endTime - incentive.startTime)
    const elapsed = Math.min(duration, Math.max(0, nowSeconds - incentive.startTime))
    const remaining = duration - elapsed
    const progress = elapsed / duration

    const reward = Number(formatUnits(BigInt(incentive.reward), rewardDecimals))
    const distributedReward = reward * progress
    const remainingReward = reward - distributedReward

    const rewardPerDay = (reward / duration) * SECONDS_PER_DAY
    const rewardUsd = rewardPriceUsd === null ? null : reward * rewardPriceUsd
    const rewardUsdPerDay = rewardPriceUsd === null ? null : rewardPerDay * rewardPriceUsd

    const tvlUsd = pool?.tvlUsd ?? null
    const rewardApr =
        status !== 'active' || rewardPriceUsd === null || tvlUsd === null || tvlUsd <= 0
            ? null
            : ((remainingReward * rewardPriceUsd) / tvlUsd) *
              ((DAYS_PER_YEAR * SECONDS_PER_DAY) / remaining) *
              100

    return {
        incentiveId: incentive.incentiveId,
        status,
        pool: incentive.pool,
        poolLabel: poolLabel(pool, incentive.pool),
        rewardToken: incentive.rewardToken,
        rewardSymbol,
        startTime: incentive.startTime,
        endTime: incentive.endTime,
        durationDays: duration / SECONDS_PER_DAY,
        remainingDays: remaining / SECONDS_PER_DAY,
        progressPercent: progress * 100,
        reward,
        rewardPerDay,
        distributedReward,
        remainingReward,
        rewardUsd,
        rewardUsdPerDay,
        poolTvlUsd: tvlUsd,
        volume1dUsd: pool?.volume1dUsd ?? null,
        feeAprPercent: pool?.feeAprPercent ?? null,
        rewardAprPoolTvlPercent: rewardApr,
    }
}

const STATUS_ORDER: Record<IncentiveStatus, number> = {
    active: 0,
    pending: 1,
    ended: 2,
}

function totalsOf(programs: IncentiveMetrics[]): IncentiveTotals {
    let totalRewardUsd: number | null = null
    let activeRewardUsdPerDay: number | null = null
    const counts = { pending: 0, active: 0, ended: 0 }

    for (const program of programs) {
        counts[program.status] += 1
        if (program.rewardUsd !== null) totalRewardUsd = (totalRewardUsd ?? 0) + program.rewardUsd
        if (program.status === 'active' && program.rewardUsdPerDay !== null) {
            activeRewardUsdPerDay = (activeRewardUsdPerDay ?? 0) + program.rewardUsdPerDay
        }
    }

    return { programs: programs.length, ...counts, totalRewardUsd, activeRewardUsdPerDay }
}

function priceMapOf(rows: V3TokenPrice[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const row of rows) {
        const price = row.lastPriceUsd === null ? NaN : parseFloat(row.lastPriceUsd)
        if (Number.isFinite(price)) map.set(row.tokenAddr.toLowerCase(), price)
    }
    return map
}

export async function fetchIncentiveAnalytics(
    client: PonderClient,
    {
        chainId,
        limit = 200,
        nowSeconds = Math.floor(Date.now() / 1000),
    }: { chainId: number; limit?: number; nowSeconds?: number }
): Promise<IncentiveAnalytics> {
    const [incentives, tokens, prices] = await Promise.all([
        fetchIncentives(client, { chainId, limit }),
        fetchV3Tokens(client, { chainId }),
        fetchV3TokenSnapshots(client, { chainId }),
    ])
    const pools = await fetchPoolMetrics(client, {
        chainId,
        nowSeconds,
        tokens,
        tokenPrices: prices,
    })

    const poolMap = new Map(pools.map((pool) => [pool.address.toLowerCase(), pool]))
    const tokenMap = new Map(tokens.map((token) => [token.address.toLowerCase(), token]))
    const priceMap = priceMapOf(prices)

    const programs = incentives
        .map((incentive) => {
            const rewardToken = tokenMap.get(incentive.rewardToken.toLowerCase())
            return computeIncentiveMetrics({
                incentive,
                nowSeconds,
                rewardDecimals: rewardToken?.decimals ?? 18,
                rewardSymbol: rewardToken?.symbol ?? incentive.rewardToken,
                rewardPriceUsd: priceMap.get(incentive.rewardToken.toLowerCase()) ?? null,
                pool: poolMap.get(incentive.pool.toLowerCase()),
            })
        })
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.endTime - a.endTime)

    return { totals: totalsOf(programs), programs }
}

export function toTableRow(program: IncentiveMetrics) {
    return {
        status: program.status,
        pair: program.poolLabel,
        symbol: program.rewardSymbol,
        reward: program.reward,
        perDay: program.rewardPerDay,
        usdPerDay: program.rewardUsdPerDay,
        progress: program.progressPercent,
        daysLeft: program.remainingDays,
        tvlUsd: program.poolTvlUsd,
        apr: program.rewardAprPoolTvlPercent,
        feeApr: program.feeAprPercent,
    }
}

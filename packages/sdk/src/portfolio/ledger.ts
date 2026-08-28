import { formatUnits, type Address } from 'viem'
import { getStablecoins, getWrappedNativeAddress } from '../configs/chains.js'
import { isNativeToken } from '../dex/native.js'

export interface TokenPnl {
    costBasisUsd: number
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    pnlPercent: number
}

export interface PortfolioPnlTotals {
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    totalPnlPercent: number
}

export interface PnlSwapEvent {
    tokenAddr: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
}

export interface PricePoint {
    timestamp: number
    price: number
}

export interface NetWorthPoint {
    timestamp: number
    value: number
}

export const DAY_SECONDS = 86_400
export const MAX_POINTS = 96

export function makePriceAt(
    points: readonly PricePoint[],
    fallbackPrice: number | null
): (timestamp: number) => number {
    const fallback = fallbackPrice ?? 0
    if (points.length === 0) return () => fallback

    return (timestamp: number) => {
        if (timestamp < points[0]!.timestamp) return points[0]!.price
        let lo = 0
        let hi = points.length - 1
        let ans = 0
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (points[mid]!.timestamp <= timestamp) {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return points[ans]!.price
    }
}

export function downsample(
    series: NetWorthPoint[],
    startSec: number,
    nowSec: number
): NetWorthPoint[] {
    if (series.length <= MAX_POINTS) return series

    const bucketSize = (nowSec - startSec) / MAX_POINTS
    const byBucket = new Map<number, NetWorthPoint>()
    for (const point of series) {
        const bucket = Math.floor((point.timestamp - startSec) / bucketSize)
        byBucket.set(bucket, point)
    }
    return [...byBucket.values()]
}

export interface BalanceDelta {
    timestamp: number
    delta: number
}

export interface BalanceStep {
    fromTs: number
    balance: number
}

export type PriceKind = 'stable' | 'native' | 'reconstructed' | 'fallback'

export interface LedgerToken {
    currentBalance: number
    deltas: BalanceDelta[]
    priceKind: PriceKind
    nativePricePoints: PricePoint[]
    priceUsdNow: number
}

export interface BuildLedgerParams {
    tokens: LedgerToken[]
    nativeUsdPoints: PricePoint[]
    nativeUsdNow: number
    windowStart: number
    nowSec: number
    netWorthNow: number
}

export interface LedgerTokenMeta {
    address: string
    decimals: number
    priceKind: PriceKind
    isNativeCoin?: boolean
}

export function reconstructBalanceSteps(
    currentBalance: number,
    deltas: BalanceDelta[]
): BalanceStep[] {
    const sorted = [...deltas].sort((a, b) => a.timestamp - b.timestamp)
    const n = sorted.length

    let suffix = 0
    const balanceAfter = new Array<number>(n)
    for (let i = n - 1; i >= 0; i--) {
        balanceAfter[i] = currentBalance - suffix
        suffix += sorted[i]!.delta
    }
    const startBalance = currentBalance - suffix

    const steps: BalanceStep[] = [{ fromTs: 0, balance: startBalance }]
    for (let i = 0; i < n; i++) {
        steps.push({ fromTs: sorted[i]!.timestamp, balance: balanceAfter[i]! })
    }
    return steps
}

function makeStepAt(steps: readonly BalanceStep[]): (t: number) => number {
    if (steps.length === 0) return () => 0
    return (t: number) => {
        let lo = 0
        let hi = steps.length - 1
        let ans = steps[0]!.balance
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (steps[mid]!.fromTs <= t) {
                ans = steps[mid]!.balance
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return ans
    }
}

export function makeNativePriceAt(points: readonly PricePoint[]): (t: number) => number {
    return makePriceAt(points, 0)
}

interface ResolvedToken {
    balanceAt: (t: number) => number
    valueUsdAt: (t: number, nativeUsd: number) => number
}

export function buildLedgerNetWorthSeries(params: BuildLedgerParams): NetWorthPoint[] {
    const { tokens, nativeUsdPoints, nativeUsdNow, windowStart, nowSec, netWorthNow } = params

    if (netWorthNow <= 0 || !nativeUsdNow || nativeUsdNow <= 0) return []

    const nativeUsdAt = makeNativePriceAt(nativeUsdPoints)

    const gridTimes = new Set<number>([windowStart])
    for (const p of nativeUsdPoints) {
        if (p.timestamp > windowStart && p.timestamp < nowSec) gridTimes.add(p.timestamp)
    }

    const resolved: ResolvedToken[] = tokens.map((token) => {
        const steps = reconstructBalanceSteps(token.currentBalance, token.deltas)
        const balanceAt = makeStepAt(steps)
        for (const s of steps) {
            if (s.fromTs > windowStart && s.fromTs < nowSec) gridTimes.add(s.fromTs)
        }

        const nativePoints = token.nativePricePoints
        const usable = token.priceKind === 'reconstructed' && nativePoints.length > 0
        const nativePriceAt = usable ? makeNativePriceAt(nativePoints) : null
        if (usable) {
            for (const p of nativePoints) {
                if (p.timestamp > windowStart && p.timestamp < nowSec) gridTimes.add(p.timestamp)
            }
        }

        const valueUsdAt = (t: number, nativeUsd: number): number => {
            const balance = balanceAt(t)
            if (balance === 0) return 0
            if (token.priceKind === 'stable') return balance
            if (token.priceKind === 'native') return balance * nativeUsd
            if (nativePriceAt) return balance * nativePriceAt(t) * nativeUsd
            return (balance * token.priceUsdNow * nativeUsd) / nativeUsdNow
        }

        return { balanceAt, valueUsdAt }
    })

    const sortedTimes = [...gridTimes].sort((a, b) => a - b)
    const series: NetWorthPoint[] = sortedTimes.map((t) => {
        const nativeUsd = nativeUsdAt(t)
        let value = 0
        for (const token of resolved) value += token.valueUsdAt(t, nativeUsd)
        return { timestamp: t, value }
    })

    const sampled = downsample(series, windowStart, nowSec)
    sampled.push({ timestamp: nowSec, value: netWorthNow })
    return sampled
}

export function classifyPriceKind(address: string, chainId: number): PriceKind {
    if (isNativeToken(address as Address)) return 'native'
    const lower = address.toLowerCase()
    const wrapped = getWrappedNativeAddress(chainId)
    if (wrapped && lower === wrapped.toLowerCase()) return 'native'
    if (getStablecoins(chainId)?.has(lower)) return 'stable'
    return 'reconstructed'
}

export function digestSwapEvents(
    events: PnlSwapEvent[],
    tokens: LedgerTokenMeta[],
    windowStart: number,
    nowSec: number
): Map<string, BalanceDelta[]> {
    const byToken = new Map<string, PnlSwapEvent[]>()
    const nativeLeg: BalanceDelta[] = []
    for (const e of events) {
        if (e.timestamp < windowStart || e.timestamp >= nowSec) continue
        const key = e.tokenAddr.toLowerCase()
        const list = byToken.get(key) ?? []
        list.push(e)
        byToken.set(key, list)
        const native = parseFloat(formatUnits(BigInt(e.isBuy ? e.amountIn : e.amountOut), 18))
        nativeLeg.push({ timestamp: e.timestamp, delta: e.isBuy ? -native : native })
    }

    const decoded = new Map<string, BalanceDelta[]>()
    for (const token of tokens) {
        const key = token.address.toLowerCase()
        const raw = byToken.get(key)
        if (!raw) continue
        decoded.set(
            key,
            raw.map((e) => {
                const tokenRaw = e.isBuy ? e.amountOut : e.amountIn
                const amount = parseFloat(formatUnits(BigInt(tokenRaw), token.decimals))
                return { timestamp: e.timestamp, delta: e.isBuy ? amount : -amount }
            })
        )
    }

    const nativeTarget =
        tokens.find((t) => t.isNativeCoin) ?? tokens.find((t) => t.priceKind === 'native')
    if (nativeTarget) {
        const key = nativeTarget.address.toLowerCase()
        decoded.set(key, [...(decoded.get(key) ?? []), ...nativeLeg])
    }

    return decoded
}

import { formatEther } from 'viem'
import type { V3PoolDayVolumeRow } from '../ponder/queries/pools.js'

const Q192 = 2n ** 192n
const SECONDS_PER_DAY = 86400
const MAX_NATIVE_USD_PRICE = 1e6

export interface PoolUsdMeta {
    address: string
    token0: { address: string; decimals: number }
    token1: { address: string; decimals: number }
    sqrtPriceX96: bigint
}

export interface PoolBalances {
    balance0: bigint
    balance1: bigint
}

function isAddr(a: string, b: string | undefined): boolean {
    return !!b && a.toLowerCase() === b.toLowerCase()
}

export function priceFromSqrtPriceX96(
    sqrtPriceX96: bigint,
    token0Decimals: number,
    token1Decimals: number
): number {
    if (sqrtPriceX96 <= 0n) return 0
    const rawX = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / Q192
    return (Number(rawX) / 1e18) * 10 ** (token0Decimals - token1Decimals)
}

function deriveNativeUsdPrice(
    pools: PoolUsdMeta[],
    wrappedNative: string | undefined,
    usdStable: string | undefined
): number | null {
    const pool = pools.find(
        (p) =>
            (isAddr(p.token0.address, wrappedNative) && isAddr(p.token1.address, usdStable)) ||
            (isAddr(p.token0.address, usdStable) && isAddr(p.token1.address, wrappedNative))
    )
    if (!pool) return null
    const price = priceFromSqrtPriceX96(pool.sqrtPriceX96, 0, 0)
    const usd = isAddr(pool.token0.address, wrappedNative) ? price : 1 / price
    return Number.isFinite(usd) && usd > 0 && usd <= MAX_NATIVE_USD_PRICE ? usd : null
}

function poolValueUsd(
    { token0, token1, sqrtPriceX96 }: PoolUsdMeta,
    { balance0, balance1 }: PoolBalances,
    nativeUsdPrice: number | null,
    priceMap: Map<string, number>,
    wrappedNative: string | undefined
): number | null {
    const isToken1Native = isAddr(token1.address, wrappedNative)
    if (isToken1Native || isAddr(token0.address, wrappedNative)) {
        if (sqrtPriceX96 <= 0n) return null
        const s2 = sqrtPriceX96 * sqrtPriceX96
        const native = isToken1Native
            ? (balance0 * s2) / Q192 + balance1
            : balance0 + (balance1 * Q192) / s2
        return Number(formatEther(native)) * (nativeUsdPrice ?? 1)
    }

    const price0 = priceMap.get(token0.address.toLowerCase())
    const price1 = priceMap.get(token1.address.toLowerCase())
    if (price0 == null || price1 == null) return null
    return (
        (Number(balance0) / 10 ** token0.decimals) * price0 +
        (Number(balance1) / 10 ** token1.decimals) * price1
    )
}

export function computePoolTvlUsd(params: {
    pools: PoolUsdMeta[]
    balances: Map<string, PoolBalances>
    wrappedNative?: string
    usdStable?: string
    priceMap: Map<string, number>
}): Record<string, number | null> {
    const { pools, balances, wrappedNative, usdStable, priceMap } = params
    const nativeUsdPrice = deriveNativeUsdPrice(pools, wrappedNative, usdStable)
    const result: Record<string, number | null> = {}

    for (const pool of pools) {
        const key = pool.address.toLowerCase()
        const bal = balances.get(key)
        if (bal) result[key] = poolValueUsd(pool, bal, nativeUsdPrice, priceMap, wrappedNative)
    }

    return result
}

export function computePoolVolumesUsd(params: {
    rows: V3PoolDayVolumeRow[]
    nowSeconds: number
}): Record<string, { volume1d: number; volume30d: number }> {
    const { rows, nowSeconds } = params

    const todayStart = Math.floor(nowSeconds / SECONDS_PER_DAY) * SECONDS_PER_DAY
    const yesterdayStart = todayStart - SECONDS_PER_DAY
    const thirtyDaysAgo = todayStart - 30 * SECONDS_PER_DAY

    const result: Record<string, { volume1d: number; volume30d: number }> = {}

    for (const day of rows) {
        const entry = (result[day.poolAddress] ??= { volume1d: 0, volume30d: 0 })
        if (day.dayTimestamp >= yesterdayStart) entry.volume1d += day.volumeUsd
        if (day.dayTimestamp >= thirtyDaysAgo) entry.volume30d += day.volumeUsd
    }

    return result
}

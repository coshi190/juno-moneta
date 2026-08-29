import { formatEther } from 'viem'
import type { V3PoolDayVolumeRow } from '../ponder/queries/pools.js'

const Q96 = 2n ** 96n
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

interface PoolVolume {
    volume1d: number
    volume30d: number
}

function isAddr(a: string, b: string | undefined): boolean {
    return !!b && a.toLowerCase() === b.toLowerCase()
}

function sanitizeNativeUsd(value: number): number | null {
    return Number.isFinite(value) && value > 0 && value <= MAX_NATIVE_USD_PRICE ? value : null
}

export function priceFromSqrtPriceX96(
    sqrtPriceX96: bigint,
    token0Decimals: number,
    token1Decimals: number
): number {
    if (sqrtPriceX96 <= 0n) return 0
    const SCALE = 10n ** 18n
    const rawX = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96)
    return (Number(rawX) / 1e18) * 10 ** (token0Decimals - token1Decimals)
}

export function deriveNativeUsdPrice(
    pools: PoolUsdMeta[],
    wrappedNative: string | undefined,
    usdStable: string | undefined
): number | null {
    if (!wrappedNative || !usdStable) return null
    const nativePool = pools.find(
        (p) =>
            (isAddr(p.token0.address, wrappedNative) && isAddr(p.token1.address, usdStable)) ||
            (isAddr(p.token0.address, usdStable) && isAddr(p.token1.address, wrappedNative))
    )
    if (!nativePool) return null

    const sqrtPriceX96 = nativePool.sqrtPriceX96
    if (sqrtPriceX96 === 0n) return null

    const UNIT = 10n ** 18n
    const priceRaw = isAddr(nativePool.token0.address, wrappedNative)
        ? (sqrtPriceX96 * sqrtPriceX96 * UNIT) / (Q96 * Q96)
        : (Q96 * Q96 * UNIT) / (sqrtPriceX96 * sqrtPriceX96)

    return sanitizeNativeUsd(Number(priceRaw) / 1e18)
}

function amountsToNative(
    amount0: bigint,
    amount1: bigint,
    sqrtPriceX96: bigint,
    isToken1Native: boolean
): bigint {
    if (isToken1Native) return (amount0 * sqrtPriceX96 * sqrtPriceX96) / (Q96 * Q96) + amount1
    return amount0 + (amount1 * Q96 * Q96) / (sqrtPriceX96 * sqrtPriceX96)
}

export function computeValueUsd(
    amount0: bigint,
    amount1: bigint,
    sqrtPriceX96: bigint,
    isToken0Native: boolean,
    isToken1Native: boolean,
    nativeUsdPrice: number
): number | null {
    if (sqrtPriceX96 === 0n) return null
    if (!isToken0Native && !isToken1Native) return null
    const native = amountsToNative(amount0, amount1, sqrtPriceX96, isToken1Native)
    return Number(formatEther(native)) * nativeUsdPrice
}

export function computeValueFromPrices(
    amount0: bigint,
    decimals0: number,
    amount1: bigint,
    decimals1: number,
    price0: number,
    price1: number
): number {
    const human0 = Number(amount0) / Math.pow(10, decimals0)
    const human1 = Number(amount1) / Math.pow(10, decimals1)
    return human0 * price0 + human1 * price1
}

function priceAmountsUsd(
    pool: PoolUsdMeta,
    amount0: bigint,
    amount1: bigint,
    nativeUsdPrice: number | null,
    priceMap: Map<string, number>,
    wrappedNative: string | undefined
): number | null | undefined {
    const isToken0Native = isAddr(pool.token0.address, wrappedNative)
    const isToken1Native = isAddr(pool.token1.address, wrappedNative)

    if (isToken0Native || isToken1Native) {
        if (nativeUsdPrice) {
            return computeValueUsd(
                amount0,
                amount1,
                pool.sqrtPriceX96,
                isToken0Native,
                isToken1Native,
                nativeUsdPrice
            )
        }
        if (pool.sqrtPriceX96 > 0n) {
            return Number(
                formatEther(amountsToNative(amount0, amount1, pool.sqrtPriceX96, isToken1Native))
            )
        }
        return undefined
    }

    const price0 = priceMap.get(pool.token0.address.toLowerCase())
    const price1 = priceMap.get(pool.token1.address.toLowerCase())
    if (price0 == null || price1 == null) return undefined

    return computeValueFromPrices(
        amount0,
        pool.token0.decimals,
        amount1,
        pool.token1.decimals,
        price0,
        price1
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
        if (!bal) continue

        const value = priceAmountsUsd(
            pool,
            bal.balance0,
            bal.balance1,
            nativeUsdPrice,
            priceMap,
            wrappedNative
        )
        if (value !== undefined) result[key] = value
    }

    return result
}

export function computePoolVolumesUsd(params: {
    rows: V3PoolDayVolumeRow[]
    pools: PoolUsdMeta[]
    wrappedNative?: string
    usdStable?: string
    priceMap: Map<string, number>
    nowSeconds: number
}): Record<string, PoolVolume> {
    const { rows, pools, wrappedNative, usdStable, priceMap, nowSeconds } = params

    const nativeUsdPrice = deriveNativeUsdPrice(pools, wrappedNative, usdStable)

    const poolMap = new Map(pools.map((p) => [p.address.toLowerCase(), p]))

    const byPool = new Map<string, V3PoolDayVolumeRow[]>()
    for (const item of rows) {
        const list = byPool.get(item.poolAddress) ?? []
        list.push(item)
        byPool.set(item.poolAddress, list)
    }

    const todayStart = Math.floor(nowSeconds / SECONDS_PER_DAY) * SECONDS_PER_DAY
    const yesterdayStart = todayStart - SECONDS_PER_DAY
    const thirtyDaysAgo = todayStart - 30 * SECONDS_PER_DAY

    const result: Record<string, PoolVolume> = {}

    for (const [poolAddr, days] of byPool) {
        const pool = poolMap.get(poolAddr)
        if (!pool) continue

        let vol1d0 = 0n
        let vol1d1 = 0n
        let vol30d0 = 0n
        let vol30d1 = 0n

        for (const day of days) {
            const vol0 = BigInt(day.volumeToken0)
            const vol1 = BigInt(day.volumeToken1)

            if (day.dayTimestamp >= yesterdayStart) {
                vol1d0 += vol0
                vol1d1 += vol1
            }
            if (day.dayTimestamp >= thirtyDaysAgo) {
                vol30d0 += vol0
                vol30d1 += vol1
            }
        }

        const volume1d = priceAmountsUsd(
            pool,
            vol1d0,
            vol1d1,
            nativeUsdPrice,
            priceMap,
            wrappedNative
        )
        const volume30d = priceAmountsUsd(
            pool,
            vol30d0,
            vol30d1,
            nativeUsdPrice,
            priceMap,
            wrappedNative
        )
        if (volume1d === undefined || volume30d === undefined) continue

        result[poolAddr] = { volume1d: volume1d ?? 0, volume30d: volume30d ?? 0 }
    }

    return result
}

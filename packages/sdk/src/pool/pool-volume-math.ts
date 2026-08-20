import { formatEther } from 'viem'
import type { V3PoolDayVolumeRow } from '../ponder/queries/pools.js'

const Q96 = 2n ** 96n
const SECONDS_PER_DAY = 86400
const MAX_NATIVE_USD_PRICE = 1e6

function sanitizeNativeUsd(value: number): number | null {
    return Number.isFinite(value) && value > 0 && value <= MAX_NATIVE_USD_PRICE ? value : null
}

export interface PoolVolumeMeta {
    address: string
    token0: { address: string; decimals: number }
    token1: { address: string; decimals: number }
    sqrtPriceX96: bigint
}

export interface PoolVolume {
    volume1d: number
    volume30d: number
}

function isAddr(a: string, b: string | undefined): boolean {
    return !!b && a.toLowerCase() === b.toLowerCase()
}

export function deriveNativeUsdPrice(
    pools: PoolVolumeMeta[],
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

export function computeVolumeFromPrices(
    volumeToken0: bigint,
    decimals0: number,
    volumeToken1: bigint,
    decimals1: number,
    price0: number,
    price1: number
): number {
    const human0 = Number(volumeToken0) / Math.pow(10, decimals0)
    const human1 = Number(volumeToken1) / Math.pow(10, decimals1)
    return human0 * price0 + human1 * price1
}

export function computeVolumeUsd(
    volumeToken0: bigint,
    volumeToken1: bigint,
    sqrtPriceX96: bigint,
    isToken0Native: boolean,
    isToken1Native: boolean,
    nativeUsdPrice: number
): number {
    if (sqrtPriceX96 === 0n || nativeUsdPrice === 0) return 0
    if (!isToken0Native && !isToken1Native) return 0

    let volumeNative: bigint
    if (isToken1Native) {
        const vol0InNative = (volumeToken0 * sqrtPriceX96 * sqrtPriceX96) / (Q96 * Q96)
        volumeNative = vol0InNative + volumeToken1
    } else {
        const vol1InNative = (volumeToken1 * Q96 * Q96) / (sqrtPriceX96 * sqrtPriceX96)
        volumeNative = volumeToken0 + vol1InNative
    }

    return Number(formatEther(volumeNative)) * nativeUsdPrice
}

export function computePoolVolumesUsd(params: {
    rows: V3PoolDayVolumeRow[]
    pools: PoolVolumeMeta[]
    wrappedNative?: string
    usdStable?: string
    priceMap: Map<string, number>
    nowSeconds: number
}): Record<string, PoolVolume> {
    const { rows, pools, wrappedNative, usdStable, priceMap, nowSeconds } = params

    const nativeUsdPrice = deriveNativeUsdPrice(pools, wrappedNative, usdStable)

    const poolMap = new Map<string, PoolVolumeMeta>()
    pools.forEach((p) => poolMap.set(p.address.toLowerCase(), p))

    const byPool = new Map<string, V3PoolDayVolumeRow[]>()
    for (const item of rows) {
        const list = byPool.get(item.poolAddress) ?? []
        list.push(item)
        byPool.set(item.poolAddress, list)
    }

    const result: Record<string, PoolVolume> = {}
    const todayStart = Math.floor(nowSeconds / SECONDS_PER_DAY) * SECONDS_PER_DAY
    const yesterdayStart = todayStart - SECONDS_PER_DAY
    const thirtyDaysAgo = todayStart - 30 * SECONDS_PER_DAY

    for (const [poolAddr, days] of byPool) {
        const pool = poolMap.get(poolAddr)
        if (!pool) continue

        let vol1d0 = 0n,
            vol1d1 = 0n
        let vol30d0 = 0n,
            vol30d1 = 0n

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

        const isToken0Native = isAddr(pool.token0.address, wrappedNative)
        const isToken1Native = isAddr(pool.token1.address, wrappedNative)

        if (isToken0Native || isToken1Native) {
            if (nativeUsdPrice) {
                result[poolAddr] = {
                    volume1d: computeVolumeUsd(
                        vol1d0,
                        vol1d1,
                        pool.sqrtPriceX96,
                        isToken0Native,
                        isToken1Native,
                        nativeUsdPrice
                    ),
                    volume30d: computeVolumeUsd(
                        vol30d0,
                        vol30d1,
                        pool.sqrtPriceX96,
                        isToken0Native,
                        isToken1Native,
                        nativeUsdPrice
                    ),
                }
            } else if (pool.sqrtPriceX96 > 0n) {
                let vol1dNative: bigint, vol30dNative: bigint
                if (isToken1Native) {
                    vol1dNative =
                        (vol1d0 * pool.sqrtPriceX96 * pool.sqrtPriceX96) / (Q96 * Q96) + vol1d1
                    vol30dNative =
                        (vol30d0 * pool.sqrtPriceX96 * pool.sqrtPriceX96) / (Q96 * Q96) + vol30d1
                } else if (isToken0Native) {
                    vol1dNative =
                        vol1d0 + (vol1d1 * Q96 * Q96) / (pool.sqrtPriceX96 * pool.sqrtPriceX96)
                    vol30dNative =
                        vol30d0 + (vol30d1 * Q96 * Q96) / (pool.sqrtPriceX96 * pool.sqrtPriceX96)
                } else {
                    continue
                }
                result[poolAddr] = {
                    volume1d: Number(formatEther(vol1dNative)),
                    volume30d: Number(formatEther(vol30dNative)),
                }
            }
        } else {
            const price0 = priceMap.get(pool.token0.address.toLowerCase())
            const price1 = priceMap.get(pool.token1.address.toLowerCase())

            if (price0 != null && price1 != null) {
                result[poolAddr] = {
                    volume1d: computeVolumeFromPrices(
                        vol1d0,
                        pool.token0.decimals,
                        vol1d1,
                        pool.token1.decimals,
                        price0,
                        price1
                    ),
                    volume30d: computeVolumeFromPrices(
                        vol30d0,
                        pool.token0.decimals,
                        vol30d1,
                        pool.token1.decimals,
                        price0,
                        price1
                    ),
                }
            }
        }
    }

    return result
}

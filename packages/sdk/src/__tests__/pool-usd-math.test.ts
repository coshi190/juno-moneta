import { describe, it, expect } from 'vitest'
import {
    computePoolTvlUsd,
    computePoolVolumesUsd,
    computeValueFromPrices,
    computeValueUsd,
    deriveNativeUsdPrice,
    priceFromSqrtPriceX96,
    type PoolBalances,
    type PoolUsdMeta,
} from '../pool/pool-usd-math'
import type { V3PoolDayVolumeRow } from '../ponder/queries/pools'

const Q96 = 2n ** 96n
const E18 = 10n ** 18n

const NATIVE = '0x1111111111111111111111111111111111111111'
const USD = '0x2222222222222222222222222222222222222222'
const TOKEN_X = '0x3333333333333333333333333333333333333333'
const TOKEN_Y = '0x4444444444444444444444444444444444444444'
const TOKEN_Z = '0x5555555555555555555555555555555555555555'

function meta(over: Partial<PoolUsdMeta> & { address: string }): PoolUsdMeta {
    return {
        token0: { address: NATIVE, decimals: 18 },
        token1: { address: USD, decimals: 18 },
        sqrtPriceX96: Q96,
        ...over,
    }
}

function balances(entries: Array<[string, PoolBalances]>): Map<string, PoolBalances> {
    return new Map(entries.map(([addr, b]) => [addr.toLowerCase(), b]))
}

function row(
    over: Partial<V3PoolDayVolumeRow> & { poolAddress: string; dayTimestamp: number }
): V3PoolDayVolumeRow {
    return {
        volumeToken0: '0',
        volumeToken1: '0',
        swapCount: 0,
        ...over,
    }
}

describe('priceFromSqrtPriceX96', () => {
    it('returns 1:1 for sqrtP = Q96 with equal decimals', () => {
        expect(priceFromSqrtPriceX96(Q96, 18, 18)).toBeCloseTo(1)
    })

    it('prices token0 in token1 as (sqrtP/Q96)^2', () => {
        expect(priceFromSqrtPriceX96(2n * Q96, 18, 18)).toBeCloseTo(4)
    })

    it('adjusts for differing decimals', () => {
        expect(priceFromSqrtPriceX96(Q96, 6, 18)).toBeCloseTo(1e-12)
    })

    it('returns 0 for an uninitialised pool', () => {
        expect(priceFromSqrtPriceX96(0n, 18, 18)).toBe(0)
    })
})

describe('deriveNativeUsdPrice', () => {
    it('derives price when native is token0 (price = (sqrtP/Q96)^2)', () => {
        const pools = [
            meta({
                address: '0xa',
                token0: { address: NATIVE, decimals: 18 },
                token1: { address: USD, decimals: 18 },
                sqrtPriceX96: 2n * Q96,
            }),
        ]
        expect(deriveNativeUsdPrice(pools, NATIVE, USD)).toBeCloseTo(4)
    })

    it('inverts price when native is token1', () => {
        const pools = [
            meta({
                address: '0xa',
                token0: { address: USD, decimals: 18 },
                token1: { address: NATIVE, decimals: 18 },
                sqrtPriceX96: 2n * Q96,
            }),
        ]
        expect(deriveNativeUsdPrice(pools, NATIVE, USD)).toBeCloseTo(0.25)
    })

    it('returns null when the derived price is out of the plausible band (low-liquidity pool)', () => {
        const pools = [
            meta({
                address: '0xa',
                token0: { address: NATIVE, decimals: 18 },
                token1: { address: USD, decimals: 18 },
                sqrtPriceX96: 2n ** 128n,
            }),
        ]
        expect(deriveNativeUsdPrice(pools, NATIVE, USD)).toBeNull()
    })

    it('returns null when the native/usd pool has zero sqrtPrice', () => {
        const pools = [meta({ address: '0xa', sqrtPriceX96: 0n })]
        expect(deriveNativeUsdPrice(pools, NATIVE, USD)).toBeNull()
    })

    it('returns null when config addresses are missing', () => {
        const pools = [meta({ address: '0xa' })]
        expect(deriveNativeUsdPrice(pools, undefined, USD)).toBeNull()
        expect(deriveNativeUsdPrice(pools, NATIVE, undefined)).toBeNull()
    })

    it('returns null when no matching native/usd pool exists', () => {
        const pools = [
            meta({
                address: '0xa',
                token0: { address: TOKEN_X, decimals: 18 },
                token1: { address: TOKEN_Y, decimals: 18 },
            }),
        ]
        expect(deriveNativeUsdPrice(pools, NATIVE, USD)).toBeNull()
    })
})

describe('computeValueUsd', () => {
    it('converts with native as token1', () => {
        expect(computeValueUsd(5n * E18, 3n * E18, Q96, false, true, 2)).toBeCloseTo(16)
    })

    it('converts with native as token0', () => {
        expect(computeValueUsd(5n * E18, 3n * E18, Q96, true, false, 2)).toBeCloseTo(16)
    })

    it('returns null for a non-native pool', () => {
        expect(computeValueUsd(5n * E18, 3n * E18, Q96, false, false, 2)).toBeNull()
    })

    it('returns null when sqrtPrice is zero', () => {
        expect(computeValueUsd(5n * E18, 3n * E18, 0n, true, false, 2)).toBeNull()
    })
})

describe('computeValueFromPrices', () => {
    it('scales each leg by its decimals then prices', () => {
        expect(computeValueFromPrices(1_000_000n, 6, 5n * 10n ** 17n, 18, 2, 10)).toBeCloseTo(7)
    })
})

describe('computePoolTvlUsd', () => {
    it('prices a native pool in USD via the derived native/usd price', () => {
        const nativeUsdPool = meta({
            address: '0xnu',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: USD, decimals: 18 },
            sqrtPriceX96: Q96,
        })
        const poolA = meta({
            address: '0xa',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: TOKEN_X, decimals: 18 },
            sqrtPriceX96: Q96,
        })

        const result = computePoolTvlUsd({
            pools: [nativeUsdPool, poolA],
            balances: balances([['0xa', { balance0: 2n * E18, balance1: 5n * E18 }]]),
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map(),
        })

        expect(result['0xa']).toBeCloseTo(7)
    })

    it('prices a non-native pool from the price map', () => {
        const poolB = meta({
            address: '0xb',
            token0: { address: TOKEN_X, decimals: 18 },
            token1: { address: TOKEN_Y, decimals: 6 },
        })

        const result = computePoolTvlUsd({
            pools: [poolB],
            balances: balances([['0xb', { balance0: E18, balance1: 5_000_000n }]]),
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map([
                [TOKEN_X, 2],
                [TOKEN_Y, 3],
            ]),
        })

        expect(result['0xb']).toBeCloseTo(17)
    })

    it('skips a non-native pool when a price is missing', () => {
        const poolC = meta({
            address: '0xc',
            token0: { address: TOKEN_X, decimals: 18 },
            token1: { address: TOKEN_Z, decimals: 18 },
        })

        const result = computePoolTvlUsd({
            pools: [poolC],
            balances: balances([['0xc', { balance0: E18, balance1: E18 }]]),
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map([[TOKEN_X, 2]]),
        })

        expect(result['0xc']).toBeUndefined()
    })

    it('skips a pool with no balance entry', () => {
        const poolA = meta({
            address: '0xa',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: USD, decimals: 18 },
            sqrtPriceX96: Q96,
        })

        const result = computePoolTvlUsd({
            pools: [poolA],
            balances: balances([]),
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map(),
        })

        expect(result['0xa']).toBeUndefined()
    })

    it('records null for a native pool that has a USD price but no pool price', () => {
        const nativeUsdPool = meta({ address: '0xnu', sqrtPriceX96: Q96 })
        const poolE = meta({
            address: '0xe',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: TOKEN_X, decimals: 18 },
            sqrtPriceX96: 0n,
        })

        const result = computePoolTvlUsd({
            pools: [nativeUsdPool, poolE],
            balances: balances([['0xe', { balance0: E18, balance1: E18 }]]),
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map(),
        })

        expect(result['0xe']).toBeNull()
    })

    it('falls back to native-token units when no native/usd price is available', () => {
        const poolD = meta({
            address: '0xd',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: TOKEN_X, decimals: 18 },
            sqrtPriceX96: Q96,
        })

        const result = computePoolTvlUsd({
            pools: [poolD],
            balances: balances([['0xd', { balance0: 4n * E18, balance1: 2n * E18 }]]),
            wrappedNative: NATIVE,
            usdStable: undefined,
            priceMap: new Map(),
        })

        expect(result['0xd']).toBeCloseTo(6)
    })
})

describe('computePoolVolumesUsd', () => {
    const DAY = 86400
    const nowSeconds = 100 * DAY + 500
    const todayStart = 100 * DAY
    const in30dOnly = 96 * DAY
    const older = 60 * DAY

    it('buckets 1d vs 30d and prices a native pool in USD', () => {
        const nativeUsdPool = meta({
            address: '0xnu',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: USD, decimals: 18 },
            sqrtPriceX96: Q96,
        })
        const poolA = meta({
            address: '0xa',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: TOKEN_X, decimals: 18 },
            sqrtPriceX96: Q96,
        })

        const rows = [
            row({
                poolAddress: '0xa',
                dayTimestamp: todayStart,
                volumeToken0: (2n * E18).toString(),
            }),
            row({
                poolAddress: '0xa',
                dayTimestamp: in30dOnly,
                volumeToken0: (3n * E18).toString(),
            }),
            row({
                poolAddress: '0xa',
                dayTimestamp: older,
                volumeToken0: (9n * E18).toString(),
            }),
        ]

        const result = computePoolVolumesUsd({
            rows,
            pools: [nativeUsdPool, poolA],
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map(),
            nowSeconds,
        })

        expect(result['0xa']!.volume1d).toBeCloseTo(2)
        expect(result['0xa']!.volume30d).toBeCloseTo(5)
    })

    it('prices a non-native pool from the price map', () => {
        const poolB = meta({
            address: '0xb',
            token0: { address: TOKEN_X, decimals: 18 },
            token1: { address: TOKEN_Y, decimals: 6 },
        })
        const rows = [
            row({
                poolAddress: '0xb',
                dayTimestamp: todayStart,
                volumeToken0: E18.toString(),
                volumeToken1: '5000000',
            }),
        ]

        const result = computePoolVolumesUsd({
            rows,
            pools: [poolB],
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map([
                [TOKEN_X, 2],
                [TOKEN_Y, 3],
            ]),
            nowSeconds,
        })

        expect(result['0xb']!.volume1d).toBeCloseTo(17)
        expect(result['0xb']!.volume30d).toBeCloseTo(17)
    })

    it('skips rows for a pool that is not in the pool list', () => {
        const rows = [
            row({ poolAddress: '0xghost', dayTimestamp: todayStart, volumeToken0: E18.toString() }),
        ]

        const result = computePoolVolumesUsd({
            rows,
            pools: [],
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map(),
            nowSeconds,
        })

        expect(result).toEqual({})
    })

    it('falls back to native-token units when no native/usd price is available', () => {
        const poolD = meta({
            address: '0xd',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: TOKEN_X, decimals: 18 },
            sqrtPriceX96: Q96,
        })
        const rows = [
            row({
                poolAddress: '0xd',
                dayTimestamp: todayStart,
                volumeToken0: (4n * E18).toString(),
            }),
        ]

        const result = computePoolVolumesUsd({
            rows,
            pools: [poolD],
            wrappedNative: NATIVE,
            usdStable: undefined,
            priceMap: new Map(),
            nowSeconds,
        })

        expect(result['0xd']!.volume1d).toBeCloseTo(4)
        expect(result['0xd']!.volume30d).toBeCloseTo(4)
    })

    it('reports zero volume for a native pool with no pool price', () => {
        const nativeUsdPool = meta({ address: '0xnu', sqrtPriceX96: Q96 })
        const poolE = meta({
            address: '0xe',
            token0: { address: NATIVE, decimals: 18 },
            token1: { address: TOKEN_X, decimals: 18 },
            sqrtPriceX96: 0n,
        })
        const rows = [
            row({ poolAddress: '0xe', dayTimestamp: todayStart, volumeToken0: E18.toString() }),
        ]

        const result = computePoolVolumesUsd({
            rows,
            pools: [nativeUsdPool, poolE],
            wrappedNative: NATIVE,
            usdStable: USD,
            priceMap: new Map(),
            nowSeconds,
        })

        expect(result['0xe']).toEqual({ volume1d: 0, volume30d: 0 })
    })
})

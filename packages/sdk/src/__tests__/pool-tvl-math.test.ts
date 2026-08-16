import { describe, it, expect } from 'vitest'
import {
    computeTvlUsd,
    computeTvlFromPrices,
    computePoolTvlUsd,
    priceFromSqrtPriceX96,
    type PoolTvlMeta,
    type PoolBalances,
} from '../pool/pool-tvl-math'

const Q96 = 2n ** 96n
const E18 = 10n ** 18n

const NATIVE = '0x1111111111111111111111111111111111111111'
const USD = '0x2222222222222222222222222222222222222222'
const TOKEN_X = '0x3333333333333333333333333333333333333333'
const TOKEN_Y = '0x4444444444444444444444444444444444444444'
const TOKEN_Z = '0x5555555555555555555555555555555555555555'

function meta(over: Partial<PoolTvlMeta> & { address: string }): PoolTvlMeta {
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

describe('computeTvlUsd', () => {
    it('converts with native as token1', () => {
        expect(computeTvlUsd(5n * E18, 3n * E18, Q96, false, true, 2)).toBeCloseTo(16)
    })

    it('converts with native as token0', () => {
        expect(computeTvlUsd(5n * E18, 3n * E18, Q96, true, false, 2)).toBeCloseTo(16)
    })

    it('returns null for a non-native pool', () => {
        expect(computeTvlUsd(5n * E18, 3n * E18, Q96, false, false, 2)).toBeNull()
    })

    it('returns null when sqrtPrice is zero', () => {
        expect(computeTvlUsd(5n * E18, 3n * E18, 0n, true, false, 2)).toBeNull()
    })
})

describe('computeTvlFromPrices', () => {
    it('scales each leg by its decimals then prices', () => {
        expect(computeTvlFromPrices(1_000_000n, 6, 5n * 10n ** 17n, 18, 2, 10)).toBeCloseTo(7)
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

import { describe, it, expect } from 'vitest'
import { computeFeeAprPercent, fetchPoolMetrics } from '../ponder/queries/pools'
import type { PonderClient } from '../ponder/client'
import { CHAIN_IDS, STABLECOIN_ADDRESSES, WRAPPED_NATIVE_ADDRESSES } from '../configs/chains'

const Q96 = 2n ** 96n
const E18 = 10n ** 18n
const CHAIN = CHAIN_IDS.bitkub
const WRAPPED = WRAPPED_NATIVE_ADDRESSES[CHAIN]!
const STABLE = [...(STABLECOIN_ADDRESSES[CHAIN] ?? [])][0]!
const OTHER = '0xcccc000000000000000000000000000000000000'
const TOKEN_D = '0xdddd000000000000000000000000000000000000'
const POOL = '0x1111111111111111111111111111111111111111'
const NATIVE_POOL = '0x2222222222222222222222222222222222222222'
const NOW = 1_700_000_000
const DAY = Math.floor(NOW / 86400) * 86400

describe('computeFeeAprPercent', () => {
    it('annualises the 30 day average fee take', () => {
        expect(computeFeeAprPercent(3000, 1000, 30000)).toBeCloseTo(
            ((30000 / 30) * 0.003 * 365 * 100) / 1000,
            9
        )
    })

    it('returns null when tvl is missing or non positive', () => {
        expect(computeFeeAprPercent(3000, null, 30000)).toBeNull()
        expect(computeFeeAprPercent(3000, 0, 30000)).toBeNull()
        expect(computeFeeAprPercent(3000, -5, 30000)).toBeNull()
    })

    it('returns null without volume', () => {
        expect(computeFeeAprPercent(3000, 1000, 0)).toBeNull()
    })

    it('scales with the fee tier', () => {
        const low = computeFeeAprPercent(500, 1000, 30000)!
        const high = computeFeeAprPercent(10000, 1000, 30000)!
        expect(high / low).toBeCloseTo(20, 6)
    })
})

interface StubData {
    pools?: unknown[]
    tokens?: unknown[]
    states?: unknown[]
    volumes?: unknown[]
    snapshots?: unknown[]
}

function stub(data: StubData): PonderClient {
    return {
        request: async <T>(query: string) => {
            if (query.includes('v3Pools(')) return { v3Pools: { items: data.pools ?? [] } } as T
            if (query.includes('v3Tokens(')) return { v3Tokens: { items: data.tokens ?? [] } } as T
            if (query.includes('v3PoolStates('))
                return { v3PoolStates: { items: data.states ?? [] } } as T
            if (query.includes('v3PoolDayVolumes('))
                return { v3PoolDayVolumes: { items: data.volumes ?? [] } } as T
            if (query.includes('v3TokenSnapshots('))
                return { v3TokenSnapshots: { items: data.snapshots ?? [] } } as T
            return {} as T
        },
        fetchAllPages: async () => [],
    }
}

const token = (address: string, symbol: string) => ({
    id: `${CHAIN}-${address}`,
    chainId: CHAIN,
    address,
    symbol,
    name: symbol,
    decimals: 18,
})

describe('fetchPoolMetrics', () => {
    it('returns an empty list when there are no pools', async () => {
        expect(await fetchPoolMetrics(stub({}), { chainId: CHAIN })).toEqual([])
    })

    it('prices a native pool in USD from the native/stable pool', async () => {
        const metrics = await fetchPoolMetrics(
            stub({
                pools: [
                    { address: POOL, token0: OTHER, token1: WRAPPED, fee: 3000, tickSpacing: 60 },
                    {
                        address: NATIVE_POOL,
                        token0: WRAPPED,
                        token1: STABLE,
                        fee: 3000,
                        tickSpacing: 60,
                    },
                ],
                tokens: [token(OTHER, 'OTH'), token(WRAPPED, 'KKUB'), token(STABLE, 'KUSDT')],
                states: [
                    {
                        poolAddress: POOL,
                        reserve0: String(100n * E18),
                        reserve1: String(50n * E18),
                        sqrtPriceX96: String(Q96),
                        tick: 0,
                        liquidity: '777',
                    },
                    {
                        poolAddress: NATIVE_POOL,
                        reserve0: String(10n * E18),
                        reserve1: String(20n * E18),
                        sqrtPriceX96: String(Q96 * 2n),
                        tick: 10,
                        liquidity: '888',
                    },
                ],
                volumes: [
                    {
                        poolAddress: POOL.toLowerCase(),
                        dayTimestamp: DAY,
                        volumeToken0: String(E18),
                        volumeToken1: String(E18),
                        swapCount: 3,
                    },
                ],
            }),
            { chainId: CHAIN, nowSeconds: NOW }
        )

        const pool = metrics.find((m) => m.address === POOL)!
        expect(pool.tickSpacing).toBe(60)
        expect(pool.liquidity).toBe(777n)
        expect(pool.tick).toBe(0)
        expect(pool.sqrtPriceX96).toBe(Q96)
        expect(pool.price).toBeCloseTo(1, 9)
        expect(pool.token0.symbol).toBe('OTH')
        expect(pool.tvlUsd).not.toBeNull()
        expect(pool.tvlUsd!).toBeGreaterThan(0)
        expect(pool.volume1dUsd!).toBeGreaterThan(0)
        expect(pool.feeAprPercent).toBe(
            computeFeeAprPercent(3000, pool.tvlUsd, pool.volume30dUsd ?? 0)
        )
    })

    it('still reports price when USD pricing is unavailable', async () => {
        const metrics = await fetchPoolMetrics(
            stub({
                pools: [
                    { address: POOL, token0: OTHER, token1: TOKEN_D, fee: 500, tickSpacing: 10 },
                ],
                tokens: [token(OTHER, 'OTH'), token(TOKEN_D, 'DDD')],
                states: [
                    {
                        poolAddress: POOL,
                        reserve0: String(E18),
                        reserve1: String(E18),
                        sqrtPriceX96: String(Q96 * 2n),
                        tick: 5,
                        liquidity: '1',
                    },
                ],
            }),
            { chainId: CHAIN, nowSeconds: NOW }
        )

        expect(metrics[0]!.price).toBeCloseTo(4, 6)
        expect(metrics[0]!.tvlUsd).toBeNull()
        expect(metrics[0]!.feeAprPercent).toBeNull()
    })

    it('defaults missing state to a zero price and no metrics', async () => {
        const metrics = await fetchPoolMetrics(
            stub({
                pools: [
                    { address: POOL, token0: OTHER, token1: WRAPPED, fee: 3000, tickSpacing: 60 },
                ],
                tokens: [token(OTHER, 'OTH'), token(WRAPPED, 'KKUB')],
            }),
            { chainId: CHAIN, nowSeconds: NOW }
        )

        expect(metrics[0]!.sqrtPriceX96).toBe(0n)
        expect(metrics[0]!.liquidity).toBe(0n)
        expect(metrics[0]!.tick).toBeNull()
        expect(metrics[0]!.price).toBe(0)
        expect(metrics[0]!.tvlUsd).toBeNull()
    })

    it('falls back to 18 decimals for an unknown token', async () => {
        const metrics = await fetchPoolMetrics(
            stub({
                pools: [
                    { address: POOL, token0: OTHER, token1: WRAPPED, fee: 3000, tickSpacing: 60 },
                ],
                tokens: [],
            }),
            { chainId: CHAIN, nowSeconds: NOW }
        )
        expect(metrics[0]!.token0).toEqual({
            address: OTHER,
            symbol: '',
            name: '',
            decimals: 18,
        })
    })
})

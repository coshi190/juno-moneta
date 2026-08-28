import { describe, it, expect } from 'vitest'
import {
    buildPoolAddressCalls,
    buildPoolStateCalls,
    buildPositionPoolKeys,
    computePositionValueUsd,
    decodePoolAddresses,
    decodePoolStates,
    fetchPositions,
    foldPositions,
    getPositionPoolKey,
    type PositionInput,
} from '../pool/positions'
import type { ReadResult } from '../dex/multicall'
import type { PonderClient } from '../ponder/client'
import { getChains } from '../configs/chains'
import { getDexConfig, ProtocolType } from '../configs/dex'
import { getAmountsForLiquidity } from '../pool/liquidity-math'
import { tickToSqrtPriceX96 } from '../pool/tick-math'

const Q96 = 2n ** 96n
const CHAIN = getChains().bitkub
const TOKEN_A = '0xaaaa000000000000000000000000000000000000'
const TOKEN_B = '0xbbbb000000000000000000000000000000000000'
const POOL_ONE = '0x1111111111111111111111111111111111111111'
const POOL_TWO = '0x2222222222222222222222222222222222222222'
const ZERO = '0x0000000000000000000000000000000000000000'

function position(overrides: Partial<PositionInput> = {}): PositionInput {
    return {
        tokenId: 1n,
        owner: '0xdead000000000000000000000000000000000000',
        token0: TOKEN_A,
        token1: TOKEN_B,
        fee: 3000,
        tickLower: -6000,
        tickUpper: 6000,
        liquidity: 1_000_000n,
        tokensOwed0: 11n,
        tokensOwed1: 22n,
        ...overrides,
    }
}

const ok = (result: unknown): ReadResult => ({ status: 'success', result })
const fail = (): ReadResult => ({ status: 'failure', error: new Error('reverted') })

describe('buildPositionPoolKeys', () => {
    it('dedupes and preserves first-seen order', () => {
        const keys = buildPositionPoolKeys([
            position(),
            position({ tokenId: 2n }),
            position({ tokenId: 3n, fee: 500 }),
        ])
        expect(keys.map((k) => k.fee)).toEqual([3000, 500])
    })

    it('keys case-insensitively', () => {
        expect(getPositionPoolKey(TOKEN_A.toUpperCase(), TOKEN_B, 3000)).toBe(
            getPositionPoolKey(TOKEN_A, TOKEN_B, 3000)
        )
    })
})

describe('decodePoolAddresses', () => {
    it('keys by pool key, so two keys sharing one address stay distinct', () => {
        const keys = buildPositionPoolKeys([position(), position({ tokenId: 2n, fee: 500 })])
        const map = decodePoolAddresses(keys, [ok(POOL_ONE), ok(POOL_ONE)])
        expect(map.size).toBe(2)
        expect(map.get(keys[0]!.key)).toBe(POOL_ONE)
        expect(map.get(keys[1]!.key)).toBe(POOL_ONE)
    })

    it('drops zero addresses and failed reads', () => {
        const keys = buildPositionPoolKeys([
            position(),
            position({ tokenId: 2n, fee: 500 }),
            position({ tokenId: 3n, fee: 100 }),
        ])
        const map = decodePoolAddresses(keys, [ok(ZERO), fail(), ok(POOL_TWO)])
        expect(map.size).toBe(1)
        expect(map.get(keys[2]!.key)).toBe(POOL_TWO)
    })
})

describe('buildPoolStateCalls / decodePoolStates', () => {
    it('emits two calls per pool', () => {
        const calls = buildPoolStateCalls([POOL_ONE, POOL_TWO])
        expect(calls).toHaveLength(4)
        expect(calls.map((c) => c.functionName)).toEqual([
            'slot0',
            'liquidity',
            'slot0',
            'liquidity',
        ])
    })

    it('strides by two and survives a failure at an odd index', () => {
        const map = decodePoolStates(
            [POOL_ONE, POOL_TWO],
            [ok([Q96, 100]), fail(), ok([Q96 * 2n, -50]), ok(999n)]
        )
        expect(map.get(POOL_ONE.toLowerCase())).toEqual({
            sqrtPriceX96: Q96,
            tick: 100,
            liquidity: 0n,
        })
        expect(map.get(POOL_TWO.toLowerCase())).toEqual({
            sqrtPriceX96: Q96 * 2n,
            tick: -50,
            liquidity: 999n,
        })
    })

    it('skips a pool whose slot0 failed', () => {
        expect(decodePoolStates([POOL_ONE], [fail(), ok(1n)]).size).toBe(0)
    })
})

describe('foldPositions', () => {
    const keys = buildPositionPoolKeys([position()])
    const poolAddresses = new Map([[keys[0]!.key, POOL_ONE as `0x${string}`]])
    const poolStates = new Map([
        [POOL_ONE.toLowerCase(), { sqrtPriceX96: Q96, tick: 0, liquidity: 5n }],
    ])

    it('computes amounts from liquidity and marks in-range', () => {
        const [folded] = foldPositions({ positions: [position()], poolAddresses, poolStates })
        const expected = getAmountsForLiquidity(
            Q96,
            tickToSqrtPriceX96(-6000),
            tickToSqrtPriceX96(6000),
            1_000_000n
        )
        expect(folded!.amount0).toBe(expected.amount0)
        expect(folded!.amount1).toBe(expected.amount1)
        expect(folded!.inRange).toBe(true)
        expect(folded!.poolAddress).toBe(POOL_ONE)
        expect(folded!.tickSpacing).toBe(60)
    })

    it('falls back to tokensOwed when no fees are supplied', () => {
        const [folded] = foldPositions({ positions: [position()], poolAddresses, poolStates })
        expect(folded!.uncollectedFees0).toBe(11n)
        expect(folded!.uncollectedFees1).toBe(22n)
    })

    it('prefers simulated fees when supplied', () => {
        const [folded] = foldPositions({
            positions: [position()],
            poolAddresses,
            poolStates,
            fees: new Map([['1', { fees0: 500n, fees1: 600n }]]),
        })
        expect(folded!.uncollectedFees0).toBe(500n)
        expect(folded!.uncollectedFees1).toBe(600n)
    })

    it('degrades to zero amounts and out-of-range with no pool state', () => {
        const [folded] = foldPositions({
            positions: [position()],
            poolAddresses: new Map(),
            poolStates: new Map(),
        })
        expect(folded!.amount0).toBe(0n)
        expect(folded!.amount1).toBe(0n)
        expect(folded!.inRange).toBe(false)
        expect(folded!.currentTick).toBe(-6000)
        expect(folded!.poolAddress).toBe(ZERO)
        expect(folded!.currentPrice).toBe(0)
    })

    it('marks a full range position', () => {
        const [folded] = foldPositions({
            positions: [position({ tickLower: -887220, tickUpper: 887220 })],
            poolAddresses,
            poolStates,
        })
        expect(folded!.isFullRange).toBe(true)
    })

    it('is out of range above the upper tick', () => {
        const [folded] = foldPositions({
            positions: [position()],
            poolAddresses,
            poolStates: new Map([
                [POOL_ONE.toLowerCase(), { sqrtPriceX96: Q96, tick: 9000, liquidity: 5n }],
            ]),
        })
        expect(folded!.inRange).toBe(false)
    })
})

describe('computePositionValueUsd', () => {
    const base = {
        amount0: 2n * 10n ** 18n,
        decimals0: 18,
        amount1: 3n * 10n ** 18n,
        decimals1: 18,
    }

    it('sums both legs', () => {
        expect(computePositionValueUsd({ ...base, price0: 10, price1: 2 })).toBeCloseTo(26, 9)
    })

    it('returns null when either side is unpriced', () => {
        expect(computePositionValueUsd({ ...base, price0: undefined, price1: 2 })).toBeNull()
        expect(computePositionValueUsd({ ...base, price0: 10, price1: undefined })).toBeNull()
    })
})

describe('fetchPositions', () => {
    const config = getDexConfig(CHAIN, undefined, ProtocolType.V3)!

    function ponderStub(rows: unknown[]): PonderClient {
        return {
            request: async <T>() => ({ v3Positions: { items: rows } }) as T,
            fetchAllPages: async () => [],
        }
    }

    const row = {
        tokenId: '7',
        owner: '0xdead000000000000000000000000000000000000',
        token0: TOKEN_A,
        token1: TOKEN_B,
        fee: 3000,
        tickLower: -6000,
        tickUpper: 6000,
        liquidity: '1000000',
        tokensOwed0: '11',
        tokensOwed1: '22',
    }

    it('resolves pool addresses then state, and folds', async () => {
        const seen: string[] = []
        const client = {
            multicall: async ({
                contracts,
            }: {
                contracts: readonly { functionName: string }[]
            }) => {
                seen.push(contracts.map((c) => c.functionName).join(','))
                if (contracts[0]?.functionName === 'getPool') return [ok(POOL_ONE)]
                return [ok([Q96, 0]), ok(5n)]
            },
            readContract: async () => undefined,
        }

        const [folded] = await fetchPositions(ponderStub([row]), client, {
            chainId: CHAIN,
            owner: row.owner,
        })

        expect(seen).toEqual(['getPool', 'slot0,liquidity'])
        expect(folded!.tokenId).toBe(7n)
        expect(folded!.poolAddress).toBe(POOL_ONE)
        expect(folded!.inRange).toBe(true)
    })

    it('skips the factory round when pool addresses are supplied', async () => {
        const seen: string[] = []
        const client = {
            multicall: async ({
                contracts,
            }: {
                contracts: readonly { functionName: string }[]
            }) => {
                seen.push(contracts.map((c) => c.functionName).join(','))
                return [ok([Q96, 0]), ok(5n)]
            },
            readContract: async () => undefined,
        }

        await fetchPositions(ponderStub([row]), client, {
            chainId: CHAIN,
            owner: row.owner,
            poolAddresses: new Map([
                [getPositionPoolKey(TOKEN_A, TOKEN_B, 3000), POOL_ONE as `0x${string}`],
            ]),
        })

        expect(seen).toEqual(['slot0,liquidity'])
    })

    it('describes caller supplied positions without querying the indexer', async () => {
        let queried = false
        const ponder: PonderClient = {
            request: async <T>() => {
                queried = true
                return { v3Positions: { items: [] } } as T
            },
            fetchAllPages: async () => [],
        }
        const client = {
            multicall: async ({ contracts }: { contracts: readonly { functionName: string }[] }) =>
                contracts[0]?.functionName === 'getPool' ? [ok(POOL_ONE)] : [ok([Q96, 0]), ok(5n)],
            readContract: async () => undefined,
        }

        const [folded] = await fetchPositions(ponder, client, {
            chainId: CHAIN,
            positions: [position({ tokenId: 99n })],
        })

        expect(queried).toBe(false)
        expect(folded!.tokenId).toBe(99n)
        expect(folded!.poolAddress).toBe(POOL_ONE)
    })

    it('returns an empty list when the indexer has no positions', async () => {
        const client = { multicall: async () => [], readContract: async () => undefined }
        expect(
            await fetchPositions(ponderStub([]), client, { chainId: CHAIN, owner: row.owner })
        ).toEqual([])
    })

    it('returns an empty list for a chain with no v3 config', async () => {
        const client = { multicall: async () => [], readContract: async () => undefined }
        expect(
            await fetchPositions(ponderStub([row]), client, { chainId: 999999, owner: row.owner })
        ).toEqual([])
    })

    it('builds factory calls against the configured factory', () => {
        const keys = buildPositionPoolKeys([position()])
        const calls = buildPoolAddressCalls(config.factory, keys)
        expect(calls[0]!.address).toBe(config.factory)
        expect(calls[0]!.args).toEqual([TOKEN_A, TOKEN_B, 3000])
    })
})

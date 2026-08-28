import { describe, it, expect } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { getChains, getWrappedNativeAddress } from '../configs/chains.js'
import { ProtocolType, getSupportedDexs, type DEXType } from '../configs/dex.js'
import { NATIVE_TOKEN_ADDRESS } from '../dex/native.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import { computePriceImpactPercent, fromAmountsOut, wrapQuoteResult } from '../dex/quote-call.js'
import { discoverV2Pairs, getV2Quotes, quoteV2Pairs } from '../dex/v2-routes.js'
import { getV3Quotes, quoteV3Pools, type DiscoveredV3Pool } from '../dex/v3-routes.js'

const CHAINS = getChains()

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const PAIR_1 = '0x3333333333333333333333333333333333333333' as Address
const POOL_1 = '0x1111111111111111111111111111111111111111' as Address
const POOL_2 = '0x2222222222222222222222222222222222222222' as Address
const KKUB = getWrappedNativeAddress(CHAINS.bitkub)!

const ok = (result: unknown): ReadResult => ({ status: 'success', result })
const fail = (message: string): ReadResult => ({ status: 'failure', error: new Error(message) })

function stubClient(phases: ReadResult[][]) {
    const batches: ContractCall[][] = []
    const client = {
        multicall: async ({ contracts }: { contracts: ContractCall[] }) => {
            batches.push(contracts)
            const phase = phases[batches.length - 1]
            if (!phase) throw new Error(`unexpected read phase ${batches.length}`)
            return phase
        },
    } as unknown as PublicClient
    return { client, batches }
}

function fallbackClient(phases: ReadResult[][]) {
    const flat = phases.flat()
    let cursor = 0
    const client = {
        multicall: async () => {
            throw new Error('ChainDoesNotSupportContract: multicall3')
        },
        readContract: async () => {
            const next = flat[cursor++]
            if (!next) throw new Error('ran out of canned results')
            if (next.status === 'failure') throw next.error
            return next.result
        },
    } as unknown as PublicClient
    return client
}

describe('quote-call — V2', () => {
    describe('fromAmountsOut', () => {
        it('takes the last amount in the path as amountOut', () => {
            expect(fromAmountsOut([1000n, 500n, 900n])).toEqual({
                amountOut: 900n,
                sqrtPriceX96After: 0n,
                initializedTicksCrossed: 0,
                gasEstimate: 150000n,
            })
        })

        it('accepts a custom gas estimate', () => {
            expect(fromAmountsOut([1000n, 900n], 200000n).gasEstimate).toBe(200000n)
        })
    })

    describe('discoverV2Pairs', () => {
        it('resolves the native sentinel to the chain wrapped native', async () => {
            const { client, batches } = stubClient([[ok(PAIR_1)]])

            const pairs = await discoverV2Pairs(client, {
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenIn: NATIVE_TOKEN_ADDRESS,
                tokenOut: TOKEN_B,
            })

            expect(pairs.get('udonswap')).toBe(PAIR_1)
            expect(batches[0]?.[0]?.args).toEqual([KKUB, TOKEN_B])
        })

        it('drops a pair that collapses to one token once resolved', async () => {
            const { client, batches } = stubClient([[]])

            const pairs = await discoverV2Pairs(client, {
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenIn: NATIVE_TOKEN_ADDRESS,
                tokenOut: KKUB,
            })

            expect(pairs.size).toBe(0)
            expect(batches).toHaveLength(0)
        })

        it('treats a zero address as no pair', async () => {
            const { client } = stubClient([[ok(zeroAddress)]])

            const pairs = await discoverV2Pairs(client, {
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
            })

            expect(pairs.size).toBe(0)
        })

        it('keeps every requested DEX in a single batched call', async () => {
            const ids = getSupportedDexs(CHAINS.bitkub, ProtocolType.V2)
            expect(ids.length).toBeGreaterThan(1)

            const { client, batches } = stubClient([ids.map(() => ok(PAIR_1))])

            const pairs = await discoverV2Pairs(client, {
                chainId: CHAINS.bitkub,
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
            })

            expect(batches[0]).toHaveLength(ids.length)
            expect(pairs.size).toBe(ids.length)
        })
    })

    describe('quoteV2Pairs', () => {
        it('quotes against discovered pairs and parses the amounts array', async () => {
            const { client, batches } = stubClient([[ok([1000n, 1234n]), ok([1n, 1n])]])
            const pairs = new Map([['udonswap', PAIR_1] as const])

            const outcomes = await quoteV2Pairs(
                client,
                { chainId: CHAINS.bitkub, tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n },
                pairs
            )

            expect(batches[0]).toHaveLength(2)
            expect(outcomes.get('udonswap')).toMatchObject({
                dexId: 'udonswap',
                pair: PAIR_1,
                error: null,
                quote: { amountOut: 1234n },
            })
        })

        it('surfaces a reverting router call as a null quote rather than throwing', async () => {
            const { client } = stubClient([
                [fail('execution reverted'), fail('execution reverted')],
            ])
            const pairs = new Map([['udonswap', PAIR_1] as const])

            const outcomes = await quoteV2Pairs(
                client,
                { chainId: CHAINS.bitkub, tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n },
                pairs
            )

            const outcome = outcomes.get('udonswap')
            expect(outcome?.quote).toBeNull()
            expect(outcome?.error).not.toBeNull()
        })
    })

    describe('getV2Quotes', () => {
        it('reads in two batches — pair discovery, then the quote', async () => {
            const { client, batches } = stubClient([[ok(PAIR_1)], [ok([1000n, 1234n])]])

            const result = await getV2Quotes(client, {
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })

            expect(batches).toHaveLength(2)
            expect(result.direct.get('udonswap')?.quote?.amountOut).toBe(1234n)
            expect(result.routes).toEqual([])
        })

        it('returns an empty map when no DEX has a pair', async () => {
            const { client } = stubClient([[ok(zeroAddress)]])

            const result = await getV2Quotes(client, {
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })

            expect(result.direct).toEqual(new Map())
        })

        it('skips discovery entirely when includeDirect is false', async () => {
            const { client, batches } = stubClient([])

            const result = await getV2Quotes(client, {
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
                includeDirect: false,
            })

            expect(batches).toHaveLength(0)
            expect(result.direct).toEqual(new Map())
        })

        it('produces the same answer on a chain with no multicall3', async () => {
            const result = await getV2Quotes(fallbackClient([[ok(PAIR_1)], [ok([1000n, 1234n])]]), {
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })

            expect(result.direct.get('udonswap')).toMatchObject({
                dexId: 'udonswap',
                pair: PAIR_1,
                error: null,
                quote: { amountOut: 1234n },
            })
        })
    })
})

describe('quote-call — V3', () => {
    describe('wrapQuoteResult', () => {
        it('is 1:1, and prices a deposit above a withdraw', () => {
            expect(wrapQuoteResult(42n, 'wrap')).toEqual({
                amountOut: 42n,
                sqrtPriceX96After: 0n,
                initializedTicksCrossed: 0,
                gasEstimate: 50000n,
            })
            expect(wrapQuoteResult(42n, 'unwrap').gasEstimate).toBe(40000n)
        })
    })

    describe('getV3Quotes', () => {
        const phases: ReadResult[][] = [
            [ok(zeroAddress), ok(POOL_1), ok(POOL_2), ok(zeroAddress)],
            [ok(100n), ok(900n)],
            [ok([1234n, 5n, 2n, 77000n]), ok([1n, 5n, 0n, 77000n])],
        ]

        it('reads in three batches — four tiers, then the surviving pools, then one quote', async () => {
            const { client, batches } = stubClient(phases)

            await getV3Quotes(client, {
                chainId: CHAINS.bitkub,
                dexId: 'junoswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })

            expect(batches).toHaveLength(3)
            expect(batches[0]).toHaveLength(4)
            expect(batches[1]).toHaveLength(2)
            expect(batches[2]).toHaveLength(2)
        })

        it('quotes against the deepest pool, not the first one found', async () => {
            const { client, batches } = stubClient(phases)

            const result = await getV3Quotes(client, {
                chainId: CHAINS.bitkub,
                dexId: 'junoswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })
            const outcome = result.direct.get('junoswap')

            const quoteArgs = batches[2]?.[0]?.args[0] as { fee: number }
            expect(quoteArgs.fee).toBe(3000)
            expect(outcome?.fee).toBe(3000)
            expect(outcome?.quote?.amountOut).toBe(1234n)
            expect(outcome?.dexId).toBe('junoswap')
        })

        it('returns an empty map when the pair has no pool on any tier', async () => {
            const { client } = stubClient([
                [ok(zeroAddress), ok(zeroAddress), ok(zeroAddress), ok(zeroAddress)],
            ])

            const result = await getV3Quotes(client, {
                chainId: CHAINS.bitkub,
                dexId: 'junoswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })
            expect(result.direct).toEqual(new Map())
            expect(result.routes).toEqual([])
        })

        it('surfaces a reverting quoter as a null quote rather than throwing', async () => {
            const { client } = stubClient([
                [ok(POOL_1), ok(zeroAddress), ok(zeroAddress), ok(zeroAddress)],
                [ok(100n)],
                [fail('execution reverted'), fail('execution reverted')],
            ])

            const result = await getV3Quotes(client, {
                chainId: CHAINS.bitkub,
                dexId: 'junoswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })
            const outcome = result.direct.get('junoswap')
            expect(outcome?.quote).toBeNull()
            expect(outcome?.error).not.toBeNull()
        })

        it('produces the same answer on a chain with no multicall3', async () => {
            const result = await getV3Quotes(fallbackClient(phases), {
                chainId: CHAINS.bitkub,
                dexId: 'junoswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })

            expect(result.direct.get('junoswap')).toMatchObject({
                dexId: 'junoswap',
                fee: 3000,
                error: null,
                quote: {
                    amountOut: 1234n,
                    sqrtPriceX96After: 5n,
                    initializedTicksCrossed: 2,
                    gasEstimate: 77000n,
                },
            })
        })
    })
})

describe('quoteV3Pools — price impact', () => {
    const pool = (): ReadonlyMap<DEXType, DiscoveredV3Pool> =>
        new Map([['junoswap', { dexId: 'junoswap', pool: POOL_1, fee: 3000, liquidity: 1n }]])

    const params = (amountIn: bigint) => ({
        chainId: CHAINS.bitkub,
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        amountIn,
    })

    it('quotes the reference size in the same batch and returns the impact', async () => {
        const { client, batches } = stubClient([[ok([1900n, 0n, 0, 0n]), ok([2n, 0n, 0, 0n])]])

        const outcomes = await quoteV3Pools(client, params(1000n), pool())

        expect(batches).toHaveLength(1)
        expect(batches[0]).toHaveLength(2)
        expect(outcomes.get('junoswap')?.priceImpact).toBeCloseTo(5)
    })

    it('skips the reference call when amountIn is too small to divide down', async () => {
        const { client, batches } = stubClient([[ok([100n, 0n, 0, 0n])]])

        const outcomes = await quoteV3Pools(client, params(500n), pool())

        expect(batches[0]).toHaveLength(1)
        expect(outcomes.get('junoswap')?.quote?.amountOut).toBe(100n)
        expect(outcomes.get('junoswap')?.priceImpact).toBeUndefined()
    })

    it('still returns the quote when only the reference call reverts', async () => {
        const { client } = stubClient([[ok([1900n, 0n, 0, 0n]), fail('reverted')]])

        const outcomes = await quoteV3Pools(client, params(1000n), pool())

        expect(outcomes.get('junoswap')?.quote?.amountOut).toBe(1900n)
        expect(outcomes.get('junoswap')?.priceImpact).toBeUndefined()
    })
})

describe('computePriceImpactPercent', () => {
    it('is ~0 when the full-trade rate matches the reference rate', () => {
        expect(computePriceImpactPercent(2000n, 1000n, 2n, 1n)).toBeCloseTo(0)
    })

    it('reports the shortfall of the full-trade rate against the reference rate', () => {
        expect(computePriceImpactPercent(1900n, 1000n, 2n, 1n)).toBeCloseTo(5)
    })

    it('clamps a better-than-reference rate to 0 rather than reporting negative impact', () => {
        expect(computePriceImpactPercent(2100n, 1000n, 2n, 1n)).toBe(0)
    })

    it('returns undefined when the reference quote produced nothing', () => {
        expect(computePriceImpactPercent(2000n, 1000n, 0n, 1n)).toBeUndefined()
    })

    it('returns undefined when there is no input amount to compare', () => {
        expect(computePriceImpactPercent(2000n, 0n, 2n, 1n)).toBeUndefined()
    })
})

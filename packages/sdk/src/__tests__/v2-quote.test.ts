import { describe, it, expect } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { CHAIN_IDS, WRAPPED_NATIVE_ADDRESSES } from '../configs/chains.js'
import { ProtocolType } from '../configs/dex-config.js'
import { NATIVE_TOKEN_ADDRESS } from '../dex/native.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import { resolveDexIds } from '../dex/v3-pools.js'
import { discoverV2Pairs, fromAmountsOut, getV2Quotes, quoteV2Pairs } from '../dex/v2-quote.js'

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const PAIR_1 = '0x1111111111111111111111111111111111111111' as Address
const KKUB = WRAPPED_NATIVE_ADDRESSES[CHAIN_IDS.bitkub]!

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

describe('dex/v2-quote', () => {
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
                chainId: CHAIN_IDS.bitkub,
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
                chainId: CHAIN_IDS.bitkub,
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
                chainId: CHAIN_IDS.bitkub,
                dexId: 'udonswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
            })

            expect(pairs.size).toBe(0)
        })

        it('keeps every requested DEX in a single batched call', async () => {
            const ids = resolveDexIds(CHAIN_IDS.bitkub, ProtocolType.V2)
            expect(ids.length).toBeGreaterThan(1)

            const { client, batches } = stubClient([ids.map(() => ok(PAIR_1))])

            const pairs = await discoverV2Pairs(client, {
                chainId: CHAIN_IDS.bitkub,
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
            })

            expect(batches[0]).toHaveLength(ids.length)
            expect(pairs.size).toBe(ids.length)
        })
    })

    describe('quoteV2Pairs', () => {
        it('quotes against discovered pairs and parses the amounts array', async () => {
            const { client, batches } = stubClient([[ok([1000n, 1234n])]])
            const pairs = new Map([['udonswap', PAIR_1] as const])

            const outcomes = await quoteV2Pairs(
                client,
                { chainId: CHAIN_IDS.bitkub, tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n },
                pairs
            )

            expect(batches[0]).toHaveLength(1)
            expect(outcomes.get('udonswap')).toMatchObject({
                dexId: 'udonswap',
                pair: PAIR_1,
                error: null,
                quote: { amountOut: 1234n },
            })
        })

        it('surfaces a reverting router call as a null quote rather than throwing', async () => {
            const { client } = stubClient([[fail('execution reverted')]])
            const pairs = new Map([['udonswap', PAIR_1] as const])

            const outcomes = await quoteV2Pairs(
                client,
                { chainId: CHAIN_IDS.bitkub, tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n },
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
                chainId: CHAIN_IDS.bitkub,
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
                chainId: CHAIN_IDS.bitkub,
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
                chainId: CHAIN_IDS.bitkub,
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
                chainId: CHAIN_IDS.bitkub,
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

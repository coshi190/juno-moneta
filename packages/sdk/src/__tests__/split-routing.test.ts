import { describe, it, expect } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { CHAIN_IDS } from '../configs/chains.js'
import { ProtocolType } from '../configs/dex-config.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import {
    computeGridAmounts,
    getSplitQuote,
    parseQuoteAmountOut,
    pickBestSplit,
    selectSplitCandidates,
    splitClearsMargin,
    type SplitQuoteGrid,
    type SplitRouteInput,
} from '../dex/split-routing.js'

const TOKEN_IN = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_OUT = '0x2222222222222222222222222222222222222222' as Address

const ok = (result: unknown): ReadResult => ({ status: 'success', result })
const fail = (): ReadResult => ({ status: 'failure', error: new Error('reverted') })

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

function route(
    dexId: string,
    amountOut: bigint,
    { isMultiHop = false, protocol = ProtocolType.V2 } = {}
): SplitRouteInput {
    return {
        dexId,
        protocolType: protocol,
        quote: { amountOut },
        route: { isMultiHop, fees: protocol === ProtocolType.V3 ? [3000] : undefined },
    }
}

describe('dex/split-routing', () => {
    describe('selectSplitCandidates', () => {
        it('returns the top two direct routes across distinct DEXes', () => {
            const picked = selectSplitCandidates([
                route('udonswap', 100n),
                route('ponder', 120n),
                route('diamon', 90n),
            ])
            expect(picked?.map((r) => r.dexId)).toEqual(['ponder', 'udonswap'])
        })

        it('keeps only the best route per DEX before ranking', () => {
            const picked = selectSplitCandidates([
                route('udonswap', 80n),
                route('udonswap', 110n),
                route('ponder', 100n),
            ])
            expect(picked?.map((r) => r.dexId)).toEqual(['udonswap', 'ponder'])
            expect(picked?.[0]!.quote.amountOut).toBe(110n)
        })

        it('ignores multi-hop routes', () => {
            expect(
                selectSplitCandidates([
                    route('udonswap', 100n),
                    route('ponder', 120n, { isMultiHop: true }),
                ])
            ).toBeNull()
        })

        it('returns null when fewer than two DEXes qualify', () => {
            expect(selectSplitCandidates([route('udonswap', 100n)])).toBeNull()
        })
    })

    describe('computeGridAmounts', () => {
        it('produces exact legs that always sum to amountIn', () => {
            const amountIn = 1_000_000_000_000_000_001n
            const { amountsInA, amountsInB } = computeGridAmounts(amountIn, [0.1, 0.5, 0.9])
            amountsInA.forEach((a, i) => expect(a + amountsInB[i]!).toBe(amountIn))
            expect(amountsInA[1]).toBe(amountIn / 2n)
        })
    })

    describe('pickBestSplit', () => {
        const base = {
            candidateA: route('ponder', 120n),
            candidateB: route('udonswap', 100n),
        }

        it('picks the interior allocation that beats routing everything through one DEX', () => {
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [30n, 50n, 70n],
                amountsInB: [70n, 50n, 30n],
                grossA: [45n, 70n, 90n],
                grossB: [50n, 70n, 40n],
                bestSingleOut: 120n,
                aggFeeBps: 0,
            }
            const best = pickBestSplit(grid)
            expect(best?.predictedNetOut).toBe(140n)
            expect(best?.amountInA).toBe(50n)
            expect(best?.amountInB).toBe(50n)
        })

        it('returns null when one route dominates every split', () => {
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [30n, 50n, 70n],
                amountsInB: [70n, 50n, 30n],
                grossA: [30n, 55n, 80n],
                grossB: [55n, 50n, 30n],
                bestSingleOut: 120n,
                aggFeeBps: 0,
            }
            expect(pickBestSplit(grid)).toBeNull()
        })

        it('applies the aggregator fee haircut to the predicted output', () => {
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [50n],
                amountsInB: [50n],
                grossA: [5000n],
                grossB: [5000n],
                bestSingleOut: 9000n,
                aggFeeBps: 100,
            }
            expect(pickBestSplit(grid)?.predictedNetOut).toBe(9900n)
        })

        it('skips grid points where a leg failed to quote', () => {
            const grid: SplitQuoteGrid = {
                ...base,
                amountsInA: [50n, 70n],
                amountsInB: [50n, 30n],
                grossA: [null, 90n],
                grossB: [70n, 40n],
                bestSingleOut: 120n,
                aggFeeBps: 0,
            }
            expect(pickBestSplit(grid)?.amountInA).toBe(70n)
        })
    })

    describe('splitClearsMargin', () => {
        const marginBps = 50

        it('clears when the predicted output beats the baseline by more than the margin', () => {
            expect(splitClearsMargin(1010n, 1000n, marginBps)).toBe(true)
        })

        it('does not clear when the improvement is within the margin', () => {
            expect(splitClearsMargin(1004n, 1000n, marginBps)).toBe(false)
        })

        it('does not clear at exactly the margin (strictly greater)', () => {
            expect(splitClearsMargin(1005n, 1000n, marginBps)).toBe(false)
        })

        it('returns false when there is no aggregator output', () => {
            expect(splitClearsMargin(null, 1000n, marginBps)).toBe(false)
        })

        it('clears by default when no single-DEX baseline exists', () => {
            expect(splitClearsMargin(1n, null, marginBps)).toBe(true)
        })

        it('returns false when neither output nor baseline exists', () => {
            expect(splitClearsMargin(null, null, marginBps)).toBe(false)
        })
    })

    describe('parseQuoteAmountOut', () => {
        it('takes the first tuple element for V3', () => {
            expect(parseQuoteAmountOut(ProtocolType.V3, ok([1234n, 0n, 0, 0n]))).toBe(1234n)
        })

        it('takes the last path amount for V2', () => {
            expect(parseQuoteAmountOut(ProtocolType.V2, ok([1000n, 500n, 987n]))).toBe(987n)
        })

        it('returns null on a failed read', () => {
            expect(parseQuoteAmountOut(ProtocolType.V2, fail())).toBeNull()
            expect(parseQuoteAmountOut(ProtocolType.V3, undefined)).toBeNull()
        })

        it('returns null for a non-positive quote', () => {
            expect(parseQuoteAmountOut(ProtocolType.V3, ok([0n, 0n, 0, 0n]))).toBeNull()
        })
    })

    describe('getSplitQuote', () => {
        const params = {
            chainId: CHAIN_IDS.bitkub,
            tokenIn: TOKEN_IN,
            tokenOut: TOKEN_OUT,
            amountIn: 100n,
            routes: [route('udonswap', 120n), route('ponder', 100n)],
            fractions: [0.5],
        }

        it('quotes the grid plus feeBps in one batch and returns the best split', async () => {
            const { client, batches } = stubClient([[ok([50n, 70n]), ok([50n, 70n]), ok(0n)]])

            const res = await getSplitQuote(client, params)

            expect(batches).toHaveLength(1)
            expect(batches[0]).toHaveLength(3)
            expect(res.allocation?.predictedNetOut).toBe(140n)
            expect(res.allocation?.amountInA).toBe(50n)
            expect(res.allocation?.amountInB).toBe(50n)
            expect(res.bestSingleOut).toBe(120n)
            expect(res.aggFeeBps).toBe(0)
        })

        it('applies the on-chain feeBps to the predicted output', async () => {
            const { client } = stubClient([[ok([0n, 5000n]), ok([0n, 5000n]), ok(100n)]])

            const res = await getSplitQuote(client, {
                ...params,
                routes: [route('udonswap', 9000n), route('ponder', 8000n)],
            })

            expect(res.aggFeeBps).toBe(100)
            expect(res.allocation?.predictedNetOut).toBe(9900n)
        })

        it('returns no allocation but still reads feeBps when fewer than two DEXes qualify', async () => {
            const { client, batches } = stubClient([[ok(30n)]])

            const res = await getSplitQuote(client, {
                ...params,
                routes: [route('udonswap', 120n)],
            })

            expect(batches[0]).toHaveLength(1)
            expect(res.allocation).toBeNull()
            expect(res.aggFeeBps).toBe(30)
        })

        it('short-circuits with no reads on a chain that has no aggregator', async () => {
            const { client, batches } = stubClient([])

            const res = await getSplitQuote(client, {
                ...params,
                chainId: CHAIN_IDS.kubTestnet,
            })

            expect(batches).toHaveLength(0)
            expect(res).toEqual({
                allocation: null,
                predictedNetOut: null,
                bestSingleOut: null,
                aggFeeBps: 0,
            })
        })
    })
})

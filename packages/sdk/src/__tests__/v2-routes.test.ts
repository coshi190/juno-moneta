import { describe, it, expect } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { CHAIN_IDS } from '../configs/chains.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import {
    buildV2RouteCandidates,
    buildViableRoutes,
    getV2Routes,
    pairKey,
    type V2RouteCandidate,
} from '../dex/v2-routes.js'

const IN = '0x1111111111111111111111111111111111111111' as Address
const OUT = '0x2222222222222222222222222222222222222222' as Address
const C1 = '0xc111111111111111111111111111111111111111' as Address
const C2 = '0xc222222222222222222222222222222222222222' as Address
const PAIR_1 = '0xdead111111111111111111111111111111111111' as Address
const PAIR_2 = '0xdead222222222222222222222222222222222222' as Address

const ok = (result: unknown): ReadResult => ({ status: 'success', result })

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

describe('dex/v2-routes', () => {
    describe('pairKey', () => {
        const FACTORY = '0xffffffffffffffffffffffffffffffffffffffff' as Address

        it('is order-independent for the token pair', () => {
            expect(pairKey(FACTORY, IN, OUT)).toBe(pairKey(FACTORY, OUT, IN))
        })

        it('distinguishes factories', () => {
            const other = '0xeeee000000000000000000000000000000000000' as Address
            expect(pairKey(FACTORY, IN, OUT)).not.toBe(pairKey(other, IN, OUT))
        })

        it('normalizes address casing', () => {
            expect(pairKey(FACTORY, IN.toUpperCase() as Address, OUT)).toBe(
                pairKey(FACTORY, IN, OUT)
            )
        })
    })

    describe('buildV2RouteCandidates', () => {
        it('builds one candidate per (V2 dex, enumerated path)', () => {
            const candidates = buildV2RouteCandidates({
                chainId: CHAIN_IDS.bitkub,
                dexId: 'udonswap',
                tokenIn: IN,
                tokenOut: OUT,
                connectors: [C1],
            })
            expect(candidates).toHaveLength(1)
            expect(candidates[0]?.tokens).toEqual([IN, C1, OUT])
            expect(candidates[0]?.dexId).toBe('udonswap')
        })

        it('is empty when there are no connectors to route through', () => {
            expect(
                buildV2RouteCandidates({
                    chainId: CHAIN_IDS.bitkub,
                    dexId: 'udonswap',
                    tokenIn: IN,
                    tokenOut: OUT,
                    connectors: [],
                })
            ).toEqual([])
        })
    })

    describe('buildViableRoutes', () => {
        const factory = '0xffffffffffffffffffffffffffffffffffffffff' as Address
        const candidate = (tokens: Address[]): V2RouteCandidate => ({
            dexId: 'udonswap',
            factory,
            tokens,
        })

        it('keeps a candidate whose every leg has a live pair', () => {
            const c = candidate([IN, C1, OUT])
            const existing = new Set([pairKey(factory, IN, C1), pairKey(factory, C1, OUT)])
            expect(buildViableRoutes([c], existing)).toEqual([c])
        })

        it('drops a candidate when any leg has no pair', () => {
            const c = candidate([IN, C1, OUT])
            const existing = new Set([pairKey(factory, IN, C1)])
            expect(buildViableRoutes([c], existing)).toEqual([])
        })

        it('respects the maxRouteQuotes cap', () => {
            const legExisting = new Set([
                pairKey(factory, IN, C1),
                pairKey(factory, C1, OUT),
                pairKey(factory, IN, C2),
                pairKey(factory, C2, OUT),
            ])
            const candidates = [candidate([IN, C1, OUT]), candidate([IN, C2, OUT])]
            expect(buildViableRoutes(candidates, legExisting, 1)).toHaveLength(1)
        })
    })

    describe('getV2Routes', () => {
        it('discovers legs then quotes the surviving path', async () => {
            const phases: ReadResult[][] = [[ok(PAIR_1), ok(PAIR_2)], [ok([1000n, 500n, 1234n])]]
            const { client, batches } = stubClient(phases)

            const routes = await getV2Routes(client, {
                chainId: CHAIN_IDS.bitkub,
                dexId: 'udonswap',
                tokenIn: IN,
                tokenOut: OUT,
                amountIn: 1000n,
                connectors: [C1],
            })

            expect(batches[0]).toHaveLength(2)
            expect(batches[1]).toHaveLength(1)
            expect(routes).toEqual([
                {
                    dexId: 'udonswap',
                    path: [IN, C1, OUT],
                    quote: {
                        amountOut: 1234n,
                        sqrtPriceX96After: 0n,
                        initializedTicksCrossed: 0,
                        gasEstimate: 200000n,
                    },
                },
            ])
        })

        it('returns no routes when a leg has no pair', async () => {
            const phases: ReadResult[][] = [[ok(PAIR_1), ok(zeroAddress)]]
            const { client } = stubClient(phases)

            const routes = await getV2Routes(client, {
                chainId: CHAIN_IDS.bitkub,
                dexId: 'udonswap',
                tokenIn: IN,
                tokenOut: OUT,
                amountIn: 1000n,
                connectors: [C1],
            })
            expect(routes).toEqual([])
        })

        it('sorts multiple surviving routes by amountOut descending', async () => {
            const phases: ReadResult[][] = [
                [ok(PAIR_1), ok(PAIR_2), ok(PAIR_1), ok(PAIR_2)],
                [ok([1000n, 500n, 900n]), ok([1000n, 500n, 1234n])],
            ]
            const { client } = stubClient(phases)

            const routes = await getV2Routes(client, {
                chainId: CHAIN_IDS.bitkub,
                dexId: 'udonswap',
                tokenIn: IN,
                tokenOut: OUT,
                amountIn: 1000n,
                connectors: [C1, C2],
                maxHops: 2,
            })

            expect(routes.map((r) => r.quote.amountOut)).toEqual([1234n, 900n])
        })
    })
})

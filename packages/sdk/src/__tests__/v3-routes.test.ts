import { describe, it, expect } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { CHAIN_IDS } from '../configs/chains.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import { poolKey } from '../dex/v3-pools.js'
import {
    MAX_DEEP_CONNECTORS,
    buildRouteCandidates,
    buildRouteMetas,
    crossProduct,
    enumerateHopPaths,
    getV3Routes,
    type V3RouteCandidate,
} from '../dex/v3-routes.js'

const IN = '0x1111111111111111111111111111111111111111' as Address
const OUT = '0x2222222222222222222222222222222222222222' as Address
const C1 = '0xc111111111111111111111111111111111111111' as Address
const C2 = '0xc222222222222222222222222222222222222222' as Address
const C3 = '0xc333333333333333333333333333333333333333' as Address
const C4 = '0xc444444444444444444444444444444444444444' as Address
const POOL_1 = '0xdead111111111111111111111111111111111111' as Address
const POOL_2 = '0xdead222222222222222222222222222222222222' as Address

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

describe('dex/v3-routes', () => {
    describe('enumerateHopPaths', () => {
        it('emits a 2-hop path per connector and 3-hop pairs of distinct connectors', () => {
            const paths = enumerateHopPaths(IN, OUT, [C1, C2], 3)
            expect(paths).toEqual([
                [IN, C1, OUT],
                [IN, C2, OUT],
                [IN, C1, C2, OUT],
                [IN, C2, C1, OUT],
            ])
        })

        it('omits 3-hop paths when maxHops is 2', () => {
            const paths = enumerateHopPaths(IN, OUT, [C1, C2], 2)
            expect(paths).toEqual([
                [IN, C1, OUT],
                [IN, C2, OUT],
            ])
        })

        it('drops a connector equal to an endpoint, case-insensitively', () => {
            const paths = enumerateHopPaths(IN, OUT, [IN.toUpperCase() as Address, C1, OUT], 3)
            expect(paths).toEqual([[IN, C1, OUT]])
        })

        it('caps 3-hop pairing at the top MAX_DEEP_CONNECTORS connectors', () => {
            const paths = enumerateHopPaths(IN, OUT, [C1, C2, C3, C4], 3)
            const twoHop = paths.filter((p) => p.length === 3)
            const threeHop = paths.filter((p) => p.length === 4)
            expect(twoHop).toHaveLength(4)
            expect(threeHop).toHaveLength(MAX_DEEP_CONNECTORS * (MAX_DEEP_CONNECTORS - 1))
        })
    })

    describe('crossProduct', () => {
        it('produces every one-fee-per-leg combination', () => {
            expect(crossProduct([[100, 500], [3000]])).toEqual([
                [100, 3000],
                [500, 3000],
            ])
        })

        it('collapses to a single empty combo when there are no legs', () => {
            expect(crossProduct([])).toEqual([[]])
        })
    })

    describe('buildRouteCandidates', () => {
        it('builds one candidate per (V3 dex, enumerated path) with fees resolved', () => {
            const candidates = buildRouteCandidates({
                chainId: CHAIN_IDS.bitkub,
                dexId: 'junoswap',
                tokenIn: IN,
                tokenOut: OUT,
                connectors: [C1],
            })
            expect(candidates).toHaveLength(1)
            expect(candidates[0]?.tokens).toEqual([IN, C1, OUT])
            expect(candidates[0]?.dexId).toBe('junoswap')
            expect(candidates[0]?.feeTiers.length).toBeGreaterThan(0)
        })

        it('is empty when there are no connectors to route through', () => {
            expect(
                buildRouteCandidates({
                    chainId: CHAIN_IDS.bitkub,
                    dexId: 'junoswap',
                    tokenIn: IN,
                    tokenOut: OUT,
                    connectors: [],
                })
            ).toEqual([])
        })
    })

    describe('buildRouteMetas', () => {
        const factory = '0xffffffffffffffffffffffffffffffffffffffff' as Address
        const candidate = (tokens: Address[], feeTiers: number[]): V3RouteCandidate => ({
            dexId: 'junoswap',
            factory,
            feeTiers,
            tokens,
        })

        it('keeps only fee combos whose every leg has a live pool', () => {
            const c = candidate([IN, C1, OUT], [500, 3000])
            const existing = new Set([
                poolKey(factory, IN, C1, 3000),
                poolKey(factory, C1, OUT, 500),
            ])
            const metas = buildRouteMetas([c], existing)
            expect(metas).toHaveLength(1)
            expect(metas[0]?.fees).toEqual([3000, 500])
        })

        it('drops a candidate when any leg has no pool on any tier', () => {
            const c = candidate([IN, C1, OUT], [500, 3000])
            const existing = new Set([poolKey(factory, IN, C1, 3000)])
            expect(buildRouteMetas([c], existing)).toEqual([])
        })

        it('respects the maxRouteQuotes cap', () => {
            const c = candidate([IN, C1, OUT], [100, 500, 3000])
            const everyLeg = new Set<string>()
            for (const fee of [100, 500, 3000]) {
                everyLeg.add(poolKey(factory, IN, C1, fee))
                everyLeg.add(poolKey(factory, C1, OUT, fee))
            }
            expect(buildRouteMetas([c], everyLeg, 4)).toHaveLength(4)
        })
    })

    describe('getV3Routes', () => {
        it('discovers legs then quotes the surviving path, mapping the array-shaped tuple', async () => {
            const phases: ReadResult[][] = [
                [
                    ok(zeroAddress),
                    ok(zeroAddress),
                    ok(POOL_1),
                    ok(zeroAddress),
                    ok(zeroAddress),
                    ok(POOL_2),
                    ok(zeroAddress),
                    ok(zeroAddress),
                ],
                [ok([1234n, [5n], [2n], 77000n])],
            ]
            const { client, batches } = stubClient(phases)

            const routes = await getV3Routes(client, {
                chainId: CHAIN_IDS.bitkub,
                dexId: 'junoswap',
                tokenIn: IN,
                tokenOut: OUT,
                amountIn: 1000n,
                connectors: [C1],
            })

            expect(batches[0]).toHaveLength(8)
            expect(batches[1]).toHaveLength(1)
            expect(routes).toEqual([
                {
                    dexId: 'junoswap',
                    path: [IN, C1, OUT],
                    fees: [3000, 500],
                    quote: {
                        amountOut: 1234n,
                        sqrtPriceX96After: 0n,
                        initializedTicksCrossed: 0,
                        gasEstimate: 77000n,
                    },
                },
            ])
        })

        it('returns no routes when a leg has no pool', async () => {
            const phases: ReadResult[][] = [
                [
                    ok(zeroAddress),
                    ok(zeroAddress),
                    ok(POOL_1),
                    ok(zeroAddress),
                    ok(zeroAddress),
                    ok(zeroAddress),
                    ok(zeroAddress),
                    ok(zeroAddress),
                ],
            ]
            const { client } = stubClient(phases)

            const routes = await getV3Routes(client, {
                chainId: CHAIN_IDS.bitkub,
                dexId: 'junoswap',
                tokenIn: IN,
                tokenOut: OUT,
                amountIn: 1000n,
                connectors: [C1],
            })
            expect(routes).toEqual([])
        })
    })
})

import { describe, it, expect } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { getChains, getWrappedNativeAddress } from '../configs/chains.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import { NATIVE_TOKEN_ADDRESS } from '../dex/native.js'
import {
    MAX_DEEP_CONNECTORS,
    buildPoolCandidates,
    buildRouteCandidates,
    buildRouteMetas,
    crossProduct,
    enumerateHopPaths,
    getV3Routes,
    pickBestPools,
    poolKey,
    resolvePoolAddresses,
    type ResolvedPool,
    type V3PoolCandidate,
    type V3RouteCandidate,
} from '../dex/v3-routes.js'

const CHAINS = getChains()

const IN = '0x1111111111111111111111111111111111111111' as Address
const OUT = '0x2222222222222222222222222222222222222222' as Address
const C1 = '0xc111111111111111111111111111111111111111' as Address
const C2 = '0xc222222222222222222222222222222222222222' as Address
const C3 = '0xc333333333333333333333333333333333333333' as Address
const C4 = '0xc444444444444444444444444444444444444444' as Address
const POOL_1 = '0xdead111111111111111111111111111111111111' as Address
const POOL_2 = '0xdead222222222222222222222222222222222222' as Address

const KKUB = getWrappedNativeAddress(CHAINS.bitkub)!

const ok = (result: unknown): ReadResult => ({ status: 'success', result })
const fail = (message: string): ReadResult => ({ status: 'failure', error: new Error(message) })

function candidate(overrides: Partial<V3PoolCandidate> = {}): V3PoolCandidate {
    return {
        dexId: 'junoswap',
        factory: '0xffffffffffffffffffffffffffffffffffffffff' as Address,
        quoter: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address,
        fee: 3000,
        tokenIn: IN,
        tokenOut: OUT,
        ...overrides,
    }
}

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
                chainId: CHAINS.bitkub,
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

        it('fans out to every V3 dex in registry order when no dexId is given', () => {
            const candidates = buildRouteCandidates({
                chainId: CHAINS.bitkub,
                tokenIn: IN,
                tokenOut: OUT,
                connectors: [C1],
            })
            expect(candidates.map((c) => c.dexId)).toEqual(['junoswap', 'kublerx'])
        })

        it('is empty when there are no connectors to route through', () => {
            expect(
                buildRouteCandidates({
                    chainId: CHAINS.bitkub,
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
                chainId: CHAINS.bitkub,
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
                chainId: CHAINS.bitkub,
                dexId: 'junoswap',
                tokenIn: IN,
                tokenOut: OUT,
                amountIn: 1000n,
                connectors: [C1],
            })
            expect(routes).toEqual([])
        })
    })

    describe('poolKey', () => {
        const FACTORY = '0xffff000000000000000000000000000000000000' as Address

        it('is order-independent for the token pair', () => {
            expect(poolKey(FACTORY, IN, OUT, 3000)).toBe(poolKey(FACTORY, OUT, IN, 3000))
        })

        it('distinguishes fee tiers and factories', () => {
            const other = '0xeeee000000000000000000000000000000000000' as Address
            expect(poolKey(FACTORY, IN, OUT, 3000)).not.toBe(poolKey(FACTORY, IN, OUT, 500))
            expect(poolKey(FACTORY, IN, OUT, 3000)).not.toBe(poolKey(other, IN, OUT, 3000))
        })

        it('normalizes address casing', () => {
            expect(poolKey(FACTORY, IN.toUpperCase() as Address, OUT, 3000)).toBe(
                poolKey(FACTORY, IN, OUT, 3000)
            )
        })
    })

    describe('buildPoolCandidates', () => {
        it('produces one candidate per (dex, configured fee tier)', () => {
            const candidates = buildPoolCandidates({
                chainId: CHAINS.bsc,
                dexIds: ['pancakeswap'],
                tokenIn: IN,
                tokenOut: OUT,
            })
            expect(candidates.map((c) => c.fee)).toEqual([100, 500, 2500, 10000])
        })

        it('resolves the native sentinel to the chain wrapped native', () => {
            const [first] = buildPoolCandidates({
                chainId: CHAINS.bitkub,
                dexIds: ['junoswap'],
                tokenIn: NATIVE_TOKEN_ADDRESS,
                tokenOut: OUT,
            })
            expect(first?.tokenIn).toBe(KKUB)
        })

        it('skips a pair that collapses to one token once resolved', () => {
            expect(
                buildPoolCandidates({
                    chainId: CHAINS.bitkub,
                    dexIds: ['junoswap'],
                    tokenIn: NATIVE_TOKEN_ADDRESS,
                    tokenOut: KKUB,
                })
            ).toEqual([])
        })
    })

    describe('resolvePoolAddresses', () => {
        it('drops tiers with no pool so the liquidity batch stays index-aligned', () => {
            const candidates = [
                candidate({ fee: 100 }),
                candidate({ fee: 500 }),
                candidate({ fee: 3000 }),
            ]
            const resolved = resolvePoolAddresses(candidates, [
                ok(zeroAddress),
                ok(POOL_1),
                ok(POOL_2),
            ])

            expect(resolved).toHaveLength(2)
            expect(resolved.map((r) => r.pool)).toEqual([POOL_1, POOL_2])
            expect(resolved.map((r) => r.candidate.fee)).toEqual([500, 3000])
        })
    })

    describe('pickBestPools', () => {
        const resolved = (fee: number, pool: Address, dexId = 'junoswap'): ResolvedPool => ({
            candidate: candidate({ fee, dexId }),
            pool,
        })

        it('picks the deepest pool', () => {
            const best = pickBestPools(
                [resolved(500, POOL_1), resolved(3000, POOL_2)],
                [ok(100n), ok(900n)]
            )
            expect(best.get('junoswap')).toMatchObject({ pool: POOL_2, fee: 3000, liquidity: 900n })
        })

        it('ignores pools with zero liquidity', () => {
            const best = pickBestPools([resolved(500, POOL_1)], [ok(0n)])
            expect(best.size).toBe(0)
        })

        it('treats a reverting liquidity read as no pool rather than crashing', () => {
            const best = pickBestPools(
                [resolved(500, POOL_1), resolved(3000, POOL_2)],
                [fail('reverted'), ok(5n)]
            )
            expect(best.get('junoswap')?.pool).toBe(POOL_2)
        })

        it('keeps a separate best pool per DEX', () => {
            const best = pickBestPools(
                [resolved(500, POOL_1, 'junoswap'), resolved(3000, POOL_2, 'kublerx')],
                [ok(10n), ok(20n)]
            )
            expect(best.get('junoswap')?.pool).toBe(POOL_1)
            expect(best.get('kublerx')?.pool).toBe(POOL_2)
        })
    })
})

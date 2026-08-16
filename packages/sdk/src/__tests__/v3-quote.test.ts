import { describe, it, expect } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { CHAIN_IDS, WRAPPED_NATIVE_ADDRESSES } from '../configs/chains.js'
import { ProtocolType, getV3Config } from '../configs/dex-config.js'
import { NATIVE_TOKEN_ADDRESS } from '../dex/native.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import {
    ALL_FEE_TIERS,
    buildPoolCandidates,
    getFeeTiers,
    pickBestPools,
    poolKey,
    resolveDexIds,
    resolvePoolAddresses,
    type ResolvedPool,
    type V3PoolCandidate,
} from '../dex/v3-pools.js'
import { getV3Quotes, wrapQuoteResult } from '../dex/v3-quote.js'

const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const POOL_1 = '0x1111111111111111111111111111111111111111' as Address
const POOL_2 = '0x2222222222222222222222222222222222222222' as Address
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

function candidate(overrides: Partial<V3PoolCandidate> = {}): V3PoolCandidate {
    return {
        dexId: 'junoswap',
        factory: '0xffffffffffffffffffffffffffffffffffffffff' as Address,
        quoter: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address,
        fee: 3000,
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        ...overrides,
    }
}

describe('dex/v3-pools', () => {
    describe('getFeeTiers', () => {
        it('honors the tiers a DEX actually runs — Pancake V3 has 2500 and no 3000', () => {
            const tiers = getFeeTiers(getV3Config(CHAIN_IDS.bsc, 'pancakeswap'))
            expect(tiers).toContain(2500)
            expect(tiers).not.toContain(3000)
        })

        it('falls back to the four canonical tiers when the config declares none', () => {
            expect(getFeeTiers(undefined)).toEqual(ALL_FEE_TIERS)
        })
    })

    describe('poolKey', () => {
        const FACTORY = '0xffff000000000000000000000000000000000000' as Address

        it('is order-independent for the token pair', () => {
            expect(poolKey(FACTORY, TOKEN_A, TOKEN_B, 3000)).toBe(
                poolKey(FACTORY, TOKEN_B, TOKEN_A, 3000)
            )
        })

        it('distinguishes fee tiers and factories', () => {
            const other = '0xeeee000000000000000000000000000000000000' as Address
            expect(poolKey(FACTORY, TOKEN_A, TOKEN_B, 3000)).not.toBe(
                poolKey(FACTORY, TOKEN_A, TOKEN_B, 500)
            )
            expect(poolKey(FACTORY, TOKEN_A, TOKEN_B, 3000)).not.toBe(
                poolKey(other, TOKEN_A, TOKEN_B, 3000)
            )
        })

        it('normalizes address casing', () => {
            expect(poolKey(FACTORY, TOKEN_A.toUpperCase() as Address, TOKEN_B, 3000)).toBe(
                poolKey(FACTORY, TOKEN_A, TOKEN_B, 3000)
            )
        })
    })

    describe('resolveDexIds', () => {
        it('returns every V3 DEX on the chain when none is requested', () => {
            const ids = resolveDexIds(CHAIN_IDS.bitkub, ProtocolType.V3)
            expect(ids).toContain('junoswap')
            expect(ids).toContain('kublerx')
        })

        it('keeps every id in an array, not just the first', () => {
            const ids = resolveDexIds(CHAIN_IDS.bitkub, ProtocolType.V3, ['junoswap', 'kublerx'])
            expect(ids).toEqual(['junoswap', 'kublerx'])
        })

        it('drops ids with no config for the protocol on that chain', () => {
            expect(
                resolveDexIds(CHAIN_IDS.bitkub, ProtocolType.V3, ['junoswap', 'pancakeswap'])
            ).toEqual(['junoswap'])
        })
    })

    describe('buildPoolCandidates', () => {
        it('produces one candidate per (dex, configured fee tier)', () => {
            const candidates = buildPoolCandidates({
                chainId: CHAIN_IDS.bsc,
                dexIds: ['pancakeswap'],
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
            })
            expect(candidates.map((c) => c.fee)).toEqual([100, 500, 2500, 10000])
        })

        it('resolves the native sentinel to the chain wrapped native', () => {
            const [first] = buildPoolCandidates({
                chainId: CHAIN_IDS.bitkub,
                dexIds: ['junoswap'],
                tokenIn: NATIVE_TOKEN_ADDRESS,
                tokenOut: TOKEN_B,
            })
            expect(first?.tokenIn).toBe(KKUB)
        })

        it('skips a pair that collapses to one token once resolved', () => {
            expect(
                buildPoolCandidates({
                    chainId: CHAIN_IDS.bitkub,
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

describe('dex/v3-quote', () => {
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
            [ok([1234n, 5n, 2n, 77000n])],
        ]

        it('reads in three batches — four tiers, then the surviving pools, then one quote', async () => {
            const { client, batches } = stubClient(phases)

            await getV3Quotes(client, {
                chainId: CHAIN_IDS.bitkub,
                dexId: 'junoswap',
                tokenIn: TOKEN_A,
                tokenOut: TOKEN_B,
                amountIn: 1000n,
            })

            expect(batches).toHaveLength(3)
            expect(batches[0]).toHaveLength(4)
            expect(batches[1]).toHaveLength(2)
            expect(batches[2]).toHaveLength(1)
        })

        it('quotes against the deepest pool, not the first one found', async () => {
            const { client, batches } = stubClient(phases)

            const result = await getV3Quotes(client, {
                chainId: CHAIN_IDS.bitkub,
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
                chainId: CHAIN_IDS.bitkub,
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
                [fail('execution reverted')],
            ])

            const result = await getV3Quotes(client, {
                chainId: CHAIN_IDS.bitkub,
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
                chainId: CHAIN_IDS.bitkub,
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

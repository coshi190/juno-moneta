import { describe, it, expect } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { CHAIN_IDS } from '../configs/chains.js'
import { ProtocolType } from '../configs/dex-config.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import { poolKey } from '../dex/v3-pools.js'
import {
    buildCrossDexLeg,
    candidateHopOptions,
    getCrossDexQuote,
    pickBestHopOption,
    selectConnectors,
} from '../dex/cross-dex-routing.js'

const CHAIN = CHAIN_IDS.jbc

const JIBSWAP_FACTORY = '0x4BBdA880C5A0cDcEc6510f0450c6C8bC5773D499' as Address
const JIBSWAP_ROUTER = '0x766F8C9321704DC228D43271AF9b7aAB0E529D38' as Address
const JUNOSWAP_FACTORY = '0x5835f123bDF137864263bf204Cf4450aAD1Ba3a7' as Address
const OPTIONS_PER_HOP = 5

const TOKEN_IN = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_OUT = '0x2222222222222222222222222222222222222222' as Address
const CONNECTOR_A = '0x3333333333333333333333333333333333333333' as Address
const CONNECTOR_B = '0x4444444444444444444444444444444444444444' as Address
const CONNECTOR_C = '0x5555555555555555555555555555555555555555' as Address

const fail = (): ReadResult => ({ status: 'failure', error: new Error('reverted') })
const v2Out = (amount: bigint): ReadResult => ({ status: 'success', result: [0n, amount] })
const v3Out = (amount: bigint): ReadResult => ({
    status: 'success',
    result: [amount, 0n, 0, 0n],
})

function hopResults(v2: ReadResult, v3: [ReadResult, ReadResult, ReadResult, ReadResult]) {
    return [v2, ...v3]
}

const allFail = () => hopResults(fail(), [fail(), fail(), fail(), fail()])

function callAmountIn(call: ContractCall): bigint {
    const first = call.args[0]
    return typeof first === 'bigint' ? first : (first as { amountIn: bigint }).amountIn
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

const quote = (
    client: PublicClient,
    overrides: Partial<Parameters<typeof getCrossDexQuote>[1]> = {}
) =>
    getCrossDexQuote(client, {
        chainId: CHAIN,
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        amountIn: 1000n,
        connectors: [CONNECTOR_A, CONNECTOR_B],
        ...overrides,
    })

describe('dex/cross-dex-routing', () => {
    describe('selectConnectors', () => {
        it('drops both endpoints case-insensitively and dedupes', () => {
            const selected = selectConnectors(TOKEN_IN, TOKEN_OUT, [
                TOKEN_IN.toUpperCase() as Address,
                CONNECTOR_A,
                CONNECTOR_A,
                TOKEN_OUT,
                CONNECTOR_B,
            ])
            expect(selected).toEqual([CONNECTOR_A, CONNECTOR_B])
        })

        it('caps at the requested maximum, keeping priority order', () => {
            const selected = selectConnectors(
                TOKEN_IN,
                TOKEN_OUT,
                [CONNECTOR_A, CONNECTOR_B, CONNECTOR_C],
                2
            )
            expect(selected).toEqual([CONNECTOR_A, CONNECTOR_B])
        })
    })

    describe('candidateHopOptions', () => {
        it('lists one option per V2 DEX and one per V3 DEX x fee tier', () => {
            const opts = candidateHopOptions(TOKEN_IN, CONNECTOR_A, CHAIN)
            expect(opts).toHaveLength(OPTIONS_PER_HOP)
            expect(opts[0]).toMatchObject({
                dexId: 'jibswap',
                protocol: ProtocolType.V2,
                factory: JIBSWAP_FACTORY,
                quoteAddress: JIBSWAP_ROUTER,
            })
            expect(opts.slice(1).map((o) => o.fee)).toEqual([100, 500, 3000, 10000])
            expect(opts.slice(1).every((o) => o.protocol === ProtocolType.V3)).toBe(true)
        })

        it('returns nothing for a same-token hop', () => {
            expect(candidateHopOptions(TOKEN_IN, TOKEN_IN, CHAIN)).toEqual([])
        })
    })

    describe('pickBestHopOption', () => {
        it('returns the highest-output option and skips failed quotes', () => {
            const opts = candidateHopOptions(TOKEN_IN, CONNECTOR_A, CHAIN)
            const best = pickBestHopOption(opts, [100n, null, 150n, null, null])
            expect(best?.output).toBe(150n)
            expect(best?.option.fee).toBe(500)
        })

        it('returns null when nothing quoted above zero', () => {
            const opts = candidateHopOptions(TOKEN_IN, CONNECTOR_A, CHAIN)
            expect(pickBestHopOption(opts, [null, 0n, null, null, null])).toBeNull()
        })
    })

    describe('buildCrossDexLeg', () => {
        it('chains two hops with per-hop factory and pool key', () => {
            const inToC = candidateHopOptions(TOKEN_IN, CONNECTOR_A, CHAIN)
            const cToOut = candidateHopOptions(CONNECTOR_A, TOKEN_OUT, CHAIN)
            const leg = buildCrossDexLeg(
                { option: inToC[0]!, output: 500n },
                { option: cToOut[3]!, output: 480n }
            )

            expect(leg.predictedOut).toBe(480n)
            expect(leg.hops.map((h) => h.dexId)).toEqual(['jibswap', 'junoswap'])
            expect(leg.hops.map((h) => h.factory)).toEqual([JIBSWAP_FACTORY, JUNOSWAP_FACTORY])
            expect(leg.hops[1]!.fee).toBe(3000)
            expect(leg.poolKeys).toEqual([
                poolKey(JIBSWAP_FACTORY, TOKEN_IN, CONNECTOR_A, 0),
                poolKey(JUNOSWAP_FACTORY, CONNECTOR_A, TOKEN_OUT, 3000),
            ])
        })
    })

    describe('getCrossDexQuote', () => {
        it('picks the best hop pair across connectors, not just per connector', async () => {
            const { client, batches } = stubClient([
                [
                    ...hopResults(v2Out(100n), [fail(), fail(), fail(), fail()]),
                    ...hopResults(fail(), [v3Out(90n), v3Out(200n), fail(), fail()]),
                ],
                [
                    ...hopResults(v2Out(1000n), [fail(), fail(), v3Out(5000n), fail()]),
                    ...hopResults(v2Out(4000n), [fail(), fail(), fail(), fail()]),
                ],
            ])

            const leg = await quote(client)

            expect(leg?.predictedOut).toBe(5000n)
            expect(leg?.hops.map((h) => h.dexId)).toEqual(['jibswap', 'junoswap'])
            expect(leg?.hops[0]!.tokenOut).toBe(CONNECTOR_A)
            expect(leg?.hops[1]!.fee).toBe(3000)
            expect(batches).toHaveLength(2)
        })

        it('quotes round two with round one’s output as the input amount', async () => {
            const { client, batches } = stubClient([
                [
                    ...hopResults(v2Out(100n), [fail(), fail(), fail(), fail()]),
                    ...hopResults(v2Out(200n), [fail(), fail(), fail(), fail()]),
                ],
                [
                    ...hopResults(v2Out(1n), [fail(), fail(), fail(), fail()]),
                    ...hopResults(v2Out(2n), [fail(), fail(), fail(), fail()]),
                ],
            ])

            await quote(client)

            expect(batches[0]!.every((c) => callAmountIn(c) === 1000n)).toBe(true)
            expect(batches[1]!.slice(0, OPTIONS_PER_HOP).map(callAmountIn)).toEqual(
                Array(OPTIONS_PER_HOP).fill(100n)
            )
            expect(batches[1]!.slice(OPTIONS_PER_HOP).map(callAmountIn)).toEqual(
                Array(OPTIONS_PER_HOP).fill(200n)
            )
        })

        it('drops a connector that failed round one from round two entirely', async () => {
            const { client, batches } = stubClient([
                [...allFail(), ...hopResults(v2Out(200n), [fail(), fail(), fail(), fail()])],
                [...hopResults(v2Out(4000n), [fail(), fail(), fail(), fail()])],
            ])

            const leg = await quote(client)

            expect(batches[0]).toHaveLength(2 * OPTIONS_PER_HOP)
            expect(batches[1]).toHaveLength(OPTIONS_PER_HOP)
            expect(leg?.hops[0]!.tokenOut).toBe(CONNECTOR_B)
        })

        it('returns null when every first-hop quote fails, without a second round', async () => {
            const { client, batches } = stubClient([[...allFail(), ...allFail()]])

            expect(await quote(client)).toBeNull()
            expect(batches).toHaveLength(1)
        })

        it('returns null when no second hop quotes', async () => {
            const { client } = stubClient([
                [...hopResults(v2Out(100n), [fail(), fail(), fail(), fail()]), ...allFail()],
                [...allFail()],
            ])

            expect(await quote(client)).toBeNull()
        })

        it('respects maxConnectors', async () => {
            const { client, batches } = stubClient([
                [...hopResults(v2Out(100n), [fail(), fail(), fail(), fail()])],
                [...hopResults(v2Out(4000n), [fail(), fail(), fail(), fail()])],
            ])

            await quote(client, {
                connectors: [CONNECTOR_A, CONNECTOR_B, CONNECTOR_C],
                maxConnectors: 1,
            })

            expect(batches[0]).toHaveLength(OPTIONS_PER_HOP)
        })

        it('reads nothing for an empty connector list, a zero amount, or a same-token swap', async () => {
            const { client, batches } = stubClient([])

            expect(await quote(client, { connectors: [] })).toBeNull()
            expect(await quote(client, { amountIn: 0n })).toBeNull()
            expect(await quote(client, { tokenOut: TOKEN_IN })).toBeNull()
            expect(batches).toHaveLength(0)
        })
    })
})

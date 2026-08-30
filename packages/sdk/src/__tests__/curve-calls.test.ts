import { describe, it, expect } from 'vitest'
import { parseEther, type Address, type PublicClient } from 'viem'
import { getChains } from '../configs/chains.js'
import { getBondingCurveDeployment } from '../configs/deployments.js'
import type { ContractCall } from '../dex/plan-swap.js'
import { SwapPlanError } from '../dex/plan-swap.js'
import type { ReadResult } from '../dex/multicall.js'
import { getCurveState, planCurveCall, type CurveTokenMetadata } from '../dex/curve-calls.js'

const CHAINS = getChains()
const CURVE_CHAIN = CHAINS.kubTestnet
const NO_CURVE_CHAIN = CHAINS.jbc

const TOKEN = '0x1111111111111111111111111111111111111111' as Address

const ok = (result: unknown): ReadResult => ({ status: 'success', result })
const failed = (): ReadResult => ({ status: 'failure', error: new Error('reverted') })

function stubClient(results: ReadResult[]) {
    const batches: ContractCall[][] = []
    const client = {
        multicall: async ({ contracts }: { contracts: ContractCall[] }) => {
            batches.push(contracts)
            return results.slice(0, contracts.length)
        },
    } as unknown as PublicClient
    return { client, batches }
}

const CREATE_FEE = parseEther('0.1')
const VIRTUAL_AMOUNT = parseEther('3400')
const GRADUATION_AMOUNT = parseEther('4000')

const GLOBALS = [ok(CREATE_FEE), ok(0n), ok(VIRTUAL_AMOUNT), ok(GRADUATION_AMOUNT)]

describe('dex/curve-calls', () => {
    describe('planCurveCall', () => {
        it('encodes buy as (token, minOut) with the native amount as value', () => {
            const call = planCurveCall(CURVE_CHAIN, {
                kind: 'buy',
                token: TOKEN,
                minOut: 42n,
                value: 100n,
            })

            expect(call.address).toBe(getBondingCurveDeployment(CURVE_CHAIN)?.address)
            expect(call.functionName).toBe('buy')
            expect(call.args).toEqual([TOKEN, 42n])
            expect(call.value).toBe(100n)
        })

        it('encodes sell as (token, amountIn, minOut) and sends no value', () => {
            const call = planCurveCall(CURVE_CHAIN, {
                kind: 'sell',
                token: TOKEN,
                amountIn: 500n,
                minOut: 42n,
            })

            expect(call.functionName).toBe('sell')
            expect(call.args).toEqual([TOKEN, 500n, 42n])
            expect(call.value).toBeUndefined()
        })

        it('encodes createToken metadata in contract order', () => {
            const metadata: CurveTokenMetadata = {
                name: 'Juno',
                symbol: 'JUNO',
                logo: 'logo',
                description: 'desc',
                link1: 'one',
                link2: 'two',
                link3: 'three',
            }

            const call = planCurveCall(CURVE_CHAIN, { kind: 'create', metadata, value: 7n })

            expect(call.functionName).toBe('createToken')
            expect(call.args).toEqual(['Juno', 'JUNO', 'logo', 'desc', 'one', 'two', 'three'])
            expect(call.value).toBe(7n)
        })

        it('encodes graduate as (token) with no value', () => {
            const call = planCurveCall(CURVE_CHAIN, { kind: 'graduate', token: TOKEN })

            expect(call.functionName).toBe('graduate')
            expect(call.args).toEqual([TOKEN])
            expect(call.value).toBeUndefined()
        })

        it('throws on a chain with no bonding curve', () => {
            expect(() => planCurveCall(NO_CURVE_CHAIN, { kind: 'graduate', token: TOKEN })).toThrow(
                SwapPlanError
            )
        })
    })

    describe('getCurveState', () => {
        it('maps the batch onto the named globals and reserves', async () => {
            const { client, batches } = stubClient([
                ...GLOBALS,
                ok([parseEther('12'), parseEther('340')]),
            ])

            const state = await getCurveState(client, { chainId: CURVE_CHAIN, token: TOKEN })

            expect(state).toMatchObject({
                createFee: CREATE_FEE,
                createFeeEther: '0.1',
                initialNative: 0n,
                initialNativeEther: '0',
                virtualAmount: VIRTUAL_AMOUNT,
                virtualAmountEther: '3400',
                graduationAmount: GRADUATION_AMOUNT,
                graduationAmountEther: '4000',
                nativeReserve: parseEther('12'),
                nativeReserveEther: '12',
                tokenReserve: parseEther('340'),
                tokenReserveEther: '340',
            })
            expect(batches[0]?.map((call) => call.functionName)).toEqual([
                'createFee',
                'initialNative',
                'virtualAmount',
                'graduationAmount',
                'pumpReserve',
            ])
            expect(batches[0]?.[4]?.args).toEqual([TOKEN])
        })

        it('derives a raise target below the nominal graduation cap', async () => {
            const { client } = stubClient(GLOBALS)

            const state = await getCurveState(client, { chainId: CURVE_CHAIN })

            expect(state?.raiseTarget).toBeGreaterThan(0n)
            expect(state?.raiseTarget).toBeLessThan(GRADUATION_AMOUNT)
        })

        it('skips the reserve read when no token is given', async () => {
            const { client, batches } = stubClient(GLOBALS)

            const state = await getCurveState(client, { chainId: CURVE_CHAIN })

            expect(batches[0]).toHaveLength(4)
            expect(state?.nativeReserve).toBe(0n)
            expect(state?.tokenReserve).toBe(0n)
        })

        it('reports zero reserves when the token has never traded', async () => {
            const { client } = stubClient([...GLOBALS, failed()])

            const state = await getCurveState(client, { chainId: CURVE_CHAIN, token: TOKEN })

            expect(state?.graduationAmount).toBe(GRADUATION_AMOUNT)
            expect(state?.nativeReserve).toBe(0n)
        })

        it('returns null when a global read fails', async () => {
            const { client } = stubClient([ok(CREATE_FEE), failed(), ok(VIRTUAL_AMOUNT), ok(4n)])

            expect(await getCurveState(client, { chainId: CURVE_CHAIN })).toBeNull()
        })

        it('returns null without reading on a chain with no bonding curve', async () => {
            const { client, batches } = stubClient(GLOBALS)

            expect(await getCurveState(client, { chainId: NO_CURVE_CHAIN })).toBeNull()
            expect(batches).toHaveLength(0)
        })
    })
})

import { describe, it, expect } from 'vitest'
import { decodeAbiParameters, size, type Address } from 'viem'
import { ProtocolType } from '../configs/dex.js'
import { getAggRouterDeployment } from '../configs/deployments.js'
import { NATIVE_TOKEN_ADDRESS } from '../dex/native.js'
import {
    pickAggregatePlan,
    planAggregateSwap,
    type AggregatePlan,
    type PickAggregatePlanInput,
} from '../dex/aggregate-plan.js'
import type { CrossDexHop, CrossDexLeg } from '../dex/cross-dex-routing.js'
import type { SplitAllocation, SplitRouteInput } from '../dex/split-routing.js'

const BITKUB = 96
const WNATIVE = '0x67ebd850304c70d983b2d1b93ea79c7cd6c3f6b5' as Address
const KUSDT = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address
const CMM = '0x9B005000A10Ac871947D99001345b01C1cEf2790' as Address
const UDON_FACTORY = '0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1' as Address
const JUNO_FACTORY = '0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C' as Address
const RECIPIENT = '0x000000000000000000000000000000000000B0B0' as Address
const REFERRER = '0x000000000000000000000000000000000000CAFE' as Address
const ROUTER = getAggRouterDeployment(BITKUB)!.address

function route(
    dexId: string,
    protocol: ProtocolType,
    path: Address[],
    fees?: number[]
): SplitRouteInput {
    return {
        dexId,
        protocolType: protocol,
        quote: { amountOut: 0n },
        route: { path, fees, isMultiHop: path.length > 2 },
    }
}

const allocation: SplitAllocation = {
    routeA: route('udonswap', ProtocolType.V2, [NATIVE_TOKEN_ADDRESS, KUSDT]),
    routeB: route('junoswap', ProtocolType.V3, [NATIVE_TOKEN_ADDRESS, KUSDT], [3000]),
    amountInA: 80n,
    amountInB: 20n,
    predictedNetOut: 500n,
}

const hop = (over: Partial<CrossDexHop> = {}): CrossDexHop => ({
    dexId: 'udonswap',
    protocol: ProtocolType.V2,
    factory: UDON_FACTORY,
    tokenIn: WNATIVE,
    tokenOut: KUSDT,
    ...over,
})

const crossLeg: CrossDexLeg = {
    hops: [
        hop(),
        hop({
            dexId: 'junoswap',
            protocol: ProtocolType.V3,
            factory: JUNO_FACTORY,
            tokenIn: KUSDT,
            tokenOut: CMM,
            fee: 3000,
        }),
    ],
    predictedOut: 1000n,
    poolKeys: [],
}

const symbols: Record<string, string> = { [WNATIVE]: 'KKUB', [KUSDT]: 'KUSDT', [CMM]: 'CMM' }
const symbolOf = (a: Address) => symbols[a.toLowerCase()] ?? symbols[a] ?? '?'

const pick = (over: Partial<PickAggregatePlanInput> = {}) =>
    pickAggregatePlan({ chainId: BITKUB, amountIn: 100n, aggFeeBps: 0, symbolOf, ...over })

const swapInput = (plan: AggregatePlan, over: Record<string, unknown> = {}) => ({
    chainId: BITKUB,
    tokenIn: WNATIVE,
    tokenOut: KUSDT,
    amountIn: 100n,
    amountOutMin: 90n,
    recipient: RECIPIENT,
    deadline: 1_700_000_000,
    referrer: REFERRER,
    plan,
    ...over,
})

describe('dex/aggregate-plan', () => {
    describe('pickAggregatePlan', () => {
        it('resolves each allocation side to its own factory and fee tier', () => {
            const plan = pick({ allocation })!.plan
            expect(plan.kind).toBe('split')
            expect(plan.predictedNetOut).toBe(500n)
            expect(plan.legs.map((l) => l.amountIn)).toEqual([80n, 20n])
            expect(plan.legs.map((l) => l.hops[0]!.factory)).toEqual([UDON_FACTORY, JUNO_FACTORY])
            expect(plan.legs[0]!.hops[0]!.fee).toBeUndefined()
            expect(plan.legs[1]!.hops[0]!.fee).toBe(3000)
        })

        it('substitutes the wrapped native for a native path entry', () => {
            expect(pick({ allocation })!.plan.legs[0]!.hops[0]!.tokenIn).toBe(WNATIVE)
        })

        it('throws when the dex has no factory on the chain', () => {
            const missing = {
                ...allocation,
                routeA: route('pancakeswap', ProtocolType.V2, [WNATIVE, KUSDT]),
            }
            expect(() => pick({ allocation: missing })).toThrow(/no v2 factory for pancakeswap/i)
        })

        it('deducts the aggregator fee from the cross-dex predicted output', () => {
            expect(pick({ crossDexLeg: crossLeg, aggFeeBps: 100 })!.plan.predictedNetOut).toBe(990n)
        })

        it('picks the higher net output and tolerates missing candidates', () => {
            expect(pick({ allocation, crossDexLeg: crossLeg })!.plan.kind).toBe('cross-dex')
            expect(pick({ allocation })!.plan.kind).toBe('split')
            expect(pick()).toBeNull()
        })

        it('reports per-leg share and the per-hop dex chain', () => {
            expect(pick({ allocation })!.legs.map((l) => l.percent)).toEqual([80, 20])
            expect(pick({ crossDexLeg: crossLeg })!.legs).toEqual([
                {
                    percent: 100,
                    hops: [
                        { dexId: 'udonswap', symbolIn: 'KKUB', symbolOut: 'KUSDT' },
                        { dexId: 'junoswap', symbolIn: 'KUSDT', symbolOut: 'CMM' },
                    ],
                },
            ])
        })
    })

    describe('planAggregateSwap', () => {
        const crossPlan = pick({ crossDexLeg: crossLeg })!.plan

        it('targets the router with per-protocol hop encoding', () => {
            const { kind, taggable, call } = planAggregateSwap(swapInput(crossPlan))
            expect(kind).toBe('swap')
            expect(taggable).toBe(true)
            expect(call.address).toBe(ROUTER)
            expect(call.functionName).toBe('aggregate')

            const [params, legs] = call.args as [
                { unwrapOut: boolean; referrer: Address },
                { hops: { factory: Address; swapData: `0x${string}` }[] }[],
            ]
            expect(params.referrer).toBe(REFERRER)
            expect(legs[0]!.hops.map((h) => h.factory)).toEqual([UDON_FACTORY, JUNO_FACTORY])
            expect(size(legs[0]!.hops[0]!.swapData)).toBe(32) // V2: address only
            expect(size(legs[0]!.hops[1]!.swapData)).toBe(64) // V3: address + fee
            expect(decodeAbiParameters([{ type: 'address' }], legs[0]!.hops[0]!.swapData)).toEqual([
                KUSDT,
            ])
        })

        it('sends value only when the input token is native', () => {
            expect(planAggregateSwap(swapInput(crossPlan)).call.value).toBeUndefined()
            expect(
                planAggregateSwap(swapInput(crossPlan, { tokenIn: NATIVE_TOKEN_ADDRESS })).call
                    .value
            ).toBe(100n)
        })

        it('keeps unwrapOut off on a chain that skips unwrapping', () => {
            const call = planAggregateSwap(
                swapInput(crossPlan, { tokenOut: NATIVE_TOKEN_ADDRESS })
            ).call
            expect((call.args[0] as { unwrapOut: boolean }).unwrapOut).toBe(false)
        })

        it('rejects legs that do not sum to the input amount', () => {
            const plan = pick({ crossDexLeg: crossLeg, amountIn: 99n })!.plan
            expect(() => planAggregateSwap(swapInput(plan))).toThrow(/sum to 99/)
        })

        it('rejects a leg with no hops', () => {
            const plan: AggregatePlan = {
                kind: 'split',
                predictedNetOut: 0n,
                legs: [{ amountIn: 100n, hops: [] }],
            }
            expect(() => planAggregateSwap(swapInput(plan))).toThrow(/no hops/)
        })

        it('rejects a V3 hop without a fee tier', () => {
            const plan: AggregatePlan = {
                kind: 'cross-dex',
                predictedNetOut: 0n,
                legs: [{ amountIn: 100n, hops: [hop({ protocol: ProtocolType.V3 })] }],
            }
            expect(() => planAggregateSwap(swapInput(plan))).toThrow(/fee tier/)
        })

        it('rejects a hop between identical tokens', () => {
            const plan: AggregatePlan = {
                kind: 'cross-dex',
                predictedNetOut: 0n,
                legs: [{ amountIn: 100n, hops: [hop({ tokenOut: WNATIVE })] }],
            }
            expect(() => planAggregateSwap(swapInput(plan))).toThrow(/same token/)
        })
    })
})

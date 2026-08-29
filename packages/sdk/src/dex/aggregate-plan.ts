import { encodeAbiParameters, type Abi, type Address, type Hex } from 'viem'
import { AGG_ROUTER_JUNOSWAP_ABI } from '../abis/agg-router-junoswap.js'
import { getAggRouterDeployment } from '../configs/deployments.js'
import { getDexConfig, ProtocolType } from '../configs/dex.js'
import { isNativeToken, resolveSwapPath, shouldSkipUnwrap } from './native.js'
import { SwapPlanError, type SwapPlan } from './plan-swap.js'
import type { CrossDexHop, CrossDexLeg } from './cross-dex-routing.js'
import type { SplitAllocation, SplitRouteInput } from './split-routing.js'

export interface AggregateLeg {
    amountIn: bigint
    hops: CrossDexHop[]
}

export interface AggregatePlan {
    kind: 'split' | 'cross-dex'
    legs: AggregateLeg[]
    predictedNetOut: bigint
}

export interface PlanAggregateInput {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    amountOutMin: bigint
    recipient: Address
    deadline: number
    referrer: Address
    plan: AggregatePlan
}

export interface PlanDisplayHop {
    dexId: string
    symbolIn: string
    symbolOut: string
}

export interface PlanDisplayLeg {
    percent: number
    hops: PlanDisplayHop[]
}

export interface PickAggregatePlanInput {
    chainId: number
    amountIn: bigint
    aggFeeBps: number
    allocation?: SplitAllocation | null
    crossDexLeg?: CrossDexLeg | null
    symbolOf: (token: Address) => string
}

export interface PickedAggregatePlan {
    plan: AggregatePlan
    legs: PlanDisplayLeg[]
}

interface EncodedHop {
    factory: Address
    swapData: Hex
}

function routeHops(route: SplitRouteInput, chainId: number): CrossDexHop[] {
    const isV3 = route.protocolType === ProtocolType.V3
    const config = getDexConfig(chainId, route.dexId, route.protocolType)
    if (!config?.factory) {
        throw new SwapPlanError(
            `No ${route.protocolType} factory for ${route.dexId} on chain ${chainId}`
        )
    }

    const wnative = isV3 ? undefined : getDexConfig(chainId, route.dexId, ProtocolType.V2)?.wnative
    const path = resolveSwapPath(route.route.path, chainId, wnative)

    return Array.from({ length: path.length - 1 }, (_, i) => ({
        dexId: route.dexId,
        protocol: route.protocolType,
        factory: config.factory,
        tokenIn: path[i]!,
        tokenOut: path[i + 1]!,
        fee: isV3 ? route.route.fees?.[i] : undefined,
    }))
}

function splitToPlan(allocation: SplitAllocation, chainId: number): AggregatePlan {
    return {
        kind: 'split',
        predictedNetOut: allocation.predictedNetOut,
        legs: [
            { amountIn: allocation.amountInA, hops: routeHops(allocation.routeA, chainId) },
            { amountIn: allocation.amountInB, hops: routeHops(allocation.routeB, chainId) },
        ],
    }
}

function crossDexToPlan(leg: CrossDexLeg, amountIn: bigint, aggFeeBps: number): AggregatePlan {
    return {
        kind: 'cross-dex',
        predictedNetOut: (leg.predictedOut * BigInt(10000 - aggFeeBps)) / 10000n,
        legs: [{ amountIn, hops: leg.hops }],
    }
}

function bestPlan(a: AggregatePlan | null, b: AggregatePlan | null): AggregatePlan | null {
    if (!a) return b
    if (!b) return a
    return b.predictedNetOut > a.predictedNetOut ? b : a
}

function describePlan(plan: AggregatePlan, symbolOf: (token: Address) => string): PlanDisplayLeg[] {
    const total = plan.legs.reduce((sum, l) => sum + l.amountIn, 0n)
    return plan.legs.map((l) => ({
        percent: total === 0n ? 0 : Number((l.amountIn * 10000n) / total) / 100,
        hops: l.hops.map((h) => ({
            dexId: h.dexId,
            symbolIn: symbolOf(h.tokenIn),
            symbolOut: symbolOf(h.tokenOut),
        })),
    }))
}

export function pickAggregatePlan(input: PickAggregatePlanInput): PickedAggregatePlan | null {
    const { chainId, amountIn, aggFeeBps, allocation, crossDexLeg, symbolOf } = input

    const split = allocation ? splitToPlan(allocation, chainId) : null
    const cross = crossDexLeg ? crossDexToPlan(crossDexLeg, amountIn, aggFeeBps) : null

    const plan = bestPlan(split, cross)
    return plan ? { plan, legs: describePlan(plan, symbolOf) } : null
}

function encodeHopSwapData(tokenOut: Address, fee?: number): Hex {
    if (fee === undefined) {
        return encodeAbiParameters([{ type: 'address' }], [tokenOut])
    }
    return encodeAbiParameters([{ type: 'address' }, { type: 'uint24' }], [tokenOut, fee])
}

function encodeHops(hops: CrossDexHop[]): EncodedHop[] {
    if (hops.length === 0) throw new SwapPlanError('Aggregate leg has no hops')
    return hops.map((h, i) => {
        if (h.tokenIn.toLowerCase() === h.tokenOut.toLowerCase()) {
            throw new SwapPlanError(`Hop ${i} resolves to the same token`)
        }
        const isV3 = h.protocol === ProtocolType.V3
        if (isV3 && h.fee === undefined) throw new SwapPlanError(`V3 hop ${i} requires a fee tier`)
        return {
            factory: h.factory,
            swapData: encodeHopSwapData(h.tokenOut, isV3 ? h.fee : undefined),
        }
    })
}

export function planAggregateSwap(input: PlanAggregateInput): SwapPlan {
    const { chainId, tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline, plan } = input

    const router = getAggRouterDeployment(chainId)?.address
    if (!router) throw new SwapPlanError(`No aggregation router deployed on chain ${chainId}`)
    if (plan.legs.length === 0) throw new SwapPlanError('Aggregate swap has no legs')

    const total = plan.legs.reduce((sum, leg) => sum + leg.amountIn, 0n)
    if (total !== amountIn) throw new SwapPlanError(`Legs sum to ${total}, expected ${amountIn}`)

    const legs = plan.legs.map((leg) => ({
        amountIn: leg.amountIn,
        hops: encodeHops(leg.hops),
    }))

    const params = {
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut: amountOutMin,
        recipient,
        deadline: BigInt(deadline),
        unwrapOut: isNativeToken(tokenOut) && !shouldSkipUnwrap(chainId),
        referrer: input.referrer,
    }

    return {
        kind: 'swap',
        taggable: true,
        call: {
            address: router,
            abi: AGG_ROUTER_JUNOSWAP_ABI as Abi,
            functionName: 'aggregate',
            args: [params, legs],
            value: isNativeToken(tokenIn) ? amountIn : undefined,
        },
    }
}

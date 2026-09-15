import { type Address } from 'viem'
import { findDex } from '../configs/dex.js'
import * as native from './native.js'
import { SwapPlanError } from './plan-swap.js'
import { getCrossDexQuote, type CrossDexHop, type CrossDexLeg } from './cross-dex-routing.js'
import { getSplitQuote, type SplitAllocation, type SplitRouteInput } from './split-routing.js'
import type { ReadClient } from './multicall.js'

export interface AggregateLeg {
    amountIn: bigint
    hops: CrossDexHop[]
}

export interface AggregatePlan {
    kind: 'split' | 'cross-dex'
    legs: AggregateLeg[]
    predictedNetOut: bigint
}

export interface PlanDisplayLeg {
    percent: number
    hops: CrossDexHop[]
}

export interface AggregatePlanParams<T extends SplitRouteInput> {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    routes: T[]
    connectors: readonly Address[]
    maxConnectors?: number
    marginBps?: number
}

export interface PickedAggregatePlan {
    plan: AggregatePlan
    legs: PlanDisplayLeg[]
    bestSingleOut: bigint
    beatsSingle: boolean
}

function routeHops(route: SplitRouteInput, chainId: number): CrossDexHop[] {
    const isV3 = route.protocolType === 'v3'
    const config = findDex(chainId, route.dexId, route.protocolType)
    if (!config?.factory) {
        throw new SwapPlanError(
            `No ${route.protocolType} factory for ${route.dexId} on chain ${chainId}`
        )
    }

    const wnative = isV3 ? undefined : findDex(chainId, route.dexId, 'v2')?.wnative
    const path = native.resolveSwapPath(route.route.path, chainId, wnative)

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

function describePlan(plan: AggregatePlan): PlanDisplayLeg[] {
    const total = plan.legs.reduce((sum, l) => sum + l.amountIn, 0n)
    return plan.legs.map((l) => ({
        percent: total === 0n ? 0 : Number((l.amountIn * 10000n) / total) / 100,
        hops: l.hops,
    }))
}

export async function getAggregatePlan<T extends SplitRouteInput>(
    client: ReadClient,
    params: AggregatePlanParams<T>
): Promise<PickedAggregatePlan | null> {
    const { chainId, amountIn, routes, marginBps = 0 } = params

    const [split, crossDexLeg] = await Promise.all([
        getSplitQuote(client, params),
        getCrossDexQuote(client, params),
    ])

    const plan = bestPlan(
        split.allocation ? splitToPlan(split.allocation, chainId) : null,
        crossDexLeg ? crossDexToPlan(crossDexLeg, amountIn, split.aggFeeBps) : null
    )
    if (!plan) return null

    const bestSingleOut = routes.reduce(
        (best, route) => (route.quote.amountOut > best ? route.quote.amountOut : best),
        0n
    )

    return {
        plan,
        legs: describePlan(plan),
        bestSingleOut,
        beatsSingle: plan.predictedNetOut * 10000n > bestSingleOut * BigInt(10000 + marginBps),
    }
}

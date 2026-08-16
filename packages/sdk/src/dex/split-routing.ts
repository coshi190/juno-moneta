import type { Abi, Address } from 'viem'
import { ProtocolType, type DEXType } from '../configs/dex-config.js'
import { getAggRouterAddress } from '../configs/deployments.js'
import { AGG_ROUTER_JUNOSWAP_ABI } from '../abis/agg-router-junoswap.js'
import { buildQuoteCall } from './quote.js'
import { batchRead, type ReadClient, type ReadResult } from './multicall.js'
import type { ContractCall } from './plan-swap.js'

export const SPLIT_FRACTIONS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

export interface SplitRouteInput {
    dexId: DEXType
    protocolType: ProtocolType
    quote: { amountOut: bigint }
    route: { fees?: number[]; isMultiHop: boolean }
}

export interface SplitAllocation<T extends SplitRouteInput = SplitRouteInput> {
    routeA: T
    routeB: T
    amountInA: bigint
    amountInB: bigint
    predictedNetOut: bigint
}

export interface SplitQuoteGrid<T extends SplitRouteInput = SplitRouteInput> {
    candidateA: T
    candidateB: T
    amountsInA: bigint[]
    amountsInB: bigint[]
    grossA: (bigint | null)[]
    grossB: (bigint | null)[]
    bestSingleOut: bigint
    aggFeeBps: number
}

export function splitClearsMargin(
    predictedNetOut: bigint | null,
    bestSingleOut: bigint | null,
    marginBps: number
): boolean {
    if (predictedNetOut == null) return false
    if (bestSingleOut == null) return true
    return predictedNetOut * 10000n > bestSingleOut * BigInt(10000 + marginBps)
}

export function selectSplitCandidates<T extends SplitRouteInput>(allRoutes: T[]): [T, T] | null {
    const bestPerDex = new Map<string, T>()
    for (const r of allRoutes) {
        if (r.route.isMultiHop) continue
        const cur = bestPerDex.get(r.dexId)
        if (!cur || r.quote.amountOut > cur.quote.amountOut) bestPerDex.set(r.dexId, r)
    }

    const sorted = [...bestPerDex.values()].sort((a, b) =>
        b.quote.amountOut > a.quote.amountOut ? 1 : b.quote.amountOut < a.quote.amountOut ? -1 : 0
    )
    if (sorted.length < 2) return null
    return [sorted[0]!, sorted[1]!]
}

export function computeGridAmounts(
    amountIn: bigint,
    fractions: number[]
): { amountsInA: bigint[]; amountsInB: bigint[] } {
    const amountsInA: bigint[] = []
    const amountsInB: bigint[] = []
    for (const f of fractions) {
        const permille = BigInt(Math.round(f * 1000))
        const a = (amountIn * permille) / 1000n
        amountsInA.push(a)
        amountsInB.push(amountIn - a)
    }
    return { amountsInA, amountsInB }
}

export function pickBestSplit<T extends SplitRouteInput>(
    g: SplitQuoteGrid<T>
): SplitAllocation<T> | null {
    const feeMul = BigInt(10000 - g.aggFeeBps)
    let best: SplitAllocation<T> | null = null

    for (let i = 0; i < g.amountsInA.length; i++) {
        const qa = g.grossA[i]
        const qb = g.grossB[i]
        if (qa == null || qb == null) continue
        if (g.amountsInA[i]! <= 0n || g.amountsInB[i]! <= 0n) continue

        const net = ((qa + qb) * feeMul) / 10000n
        if (net <= g.bestSingleOut) continue
        if (!best || net > best.predictedNetOut) {
            best = {
                routeA: g.candidateA,
                routeB: g.candidateB,
                amountInA: g.amountsInA[i]!,
                amountInB: g.amountsInB[i]!,
                predictedNetOut: net,
            }
        }
    }
    return best
}

export function parseQuoteAmountOut(
    protocol: ProtocolType,
    result: ReadResult | undefined
): bigint | null {
    if (!result || result.status !== 'success' || result.result == null) return null
    if (protocol === ProtocolType.V3) {
        const out = (result.result as readonly bigint[])[0]
        return out != null && out > 0n ? out : null
    }
    const amounts = result.result as readonly bigint[]
    const out = amounts[amounts.length - 1]
    return out != null && out > 0n ? out : null
}

export interface SplitQuoteParams<T extends SplitRouteInput> {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    routes: T[]
    fractions?: number[]
}

export interface SplitQuoteResult<T extends SplitRouteInput> {
    allocation: SplitAllocation<T> | null
    predictedNetOut: bigint | null
    bestSingleOut: bigint | null
    aggFeeBps: number
}

function buildLegQuoteCall<T extends SplitRouteInput>(
    route: T,
    amount: bigint,
    tokenIn: Address,
    tokenOut: Address,
    chainId: number
): ContractCall | null {
    const fee = route.route.fees?.[0]
    if (route.protocolType === ProtocolType.V3 && fee == null) return null

    return (
        buildQuoteCall({
            protocol: route.protocolType,
            chainId,
            dexId: route.dexId,
            tokenIn,
            tokenOut,
            amountIn: amount,
            fee,
        }) ?? null
    )
}

function feeBpsFrom(result: ReadResult | undefined): number {
    return result?.status === 'success' ? Number(result.result) : 0
}

export async function getSplitQuote<T extends SplitRouteInput>(
    client: ReadClient,
    params: SplitQuoteParams<T>
): Promise<SplitQuoteResult<T>> {
    const { chainId, tokenIn, tokenOut, amountIn, routes, fractions = SPLIT_FRACTIONS } = params
    const empty: SplitQuoteResult<T> = {
        allocation: null,
        predictedNetOut: null,
        bestSingleOut: null,
        aggFeeBps: 0,
    }

    const router = getAggRouterAddress(chainId)
    if (!router || amountIn <= 0n) return empty

    const feeBpsCall: ContractCall = {
        address: router,
        abi: AGG_ROUTER_JUNOSWAP_ABI as Abi,
        functionName: 'feeBps',
        args: [],
    }

    const candidates = selectSplitCandidates(routes)
    if (!candidates) {
        const [feeRes] = await batchRead(client, [feeBpsCall])
        return { ...empty, aggFeeBps: feeBpsFrom(feeRes) }
    }

    const [a, b] = candidates
    const { amountsInA, amountsInB } = computeGridAmounts(amountIn, fractions)
    const forRoute = (route: T, amounts: bigint[]) =>
        amounts.map((amt) => buildLegQuoteCall(route, amt, tokenIn, tokenOut, chainId))
    const gridCalls = [...forRoute(a, amountsInA), ...forRoute(b, amountsInB)]

    if (gridCalls.some((c) => c === null)) {
        const [feeRes] = await batchRead(client, [feeBpsCall])
        return { ...empty, aggFeeBps: feeBpsFrom(feeRes) }
    }

    const results = await batchRead(client, [...(gridCalls as ContractCall[]), feeBpsCall])
    const n = amountsInA.length
    const aggFeeBps = feeBpsFrom(results[2 * n])
    const grossA = amountsInA.map((_, i) => parseQuoteAmountOut(a.protocolType, results[i]))
    const grossB = amountsInB.map((_, i) => parseQuoteAmountOut(b.protocolType, results[n + i]))
    const bestSingleOut = a.quote.amountOut

    const allocation = pickBestSplit({
        candidateA: a,
        candidateB: b,
        amountsInA,
        amountsInB,
        grossA,
        grossB,
        bestSingleOut,
        aggFeeBps,
    })

    return {
        allocation,
        predictedNetOut: allocation?.predictedNetOut ?? null,
        bestSingleOut,
        aggFeeBps,
    }
}

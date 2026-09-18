import { zeroAddress, type Abi, type Address } from 'viem'
import { V2_FACTORY_ABI } from '../abis/v2-factory.js'
import { findDex, getDexes, type DEXType } from '../configs/dex.js'
import * as native from './native.js'
import { batchRead, type ReadClient } from './multicall.js'
import {
    buildQuoteCall,
    fromAmountsOut,
    quoteWithReference,
    sortByAmountOut,
    type QuoteResult,
    type RouteQuoteParams,
} from './quote-call.js'
import { enumerateHopPaths, MAX_HOPS, MAX_ROUTE_QUOTES } from './v3-routes.js'
import type { ContractCall } from './plan-swap.js'

export interface V2QuoteOutcome {
    dexId: DEXType
    path: Address[]
    pair: Address | null
    quote: QuoteResult | null
    priceImpact: number | undefined
    error: Error | null
}

function pairKey(factory: Address, tokenA: Address, tokenB: Address): string {
    const a = tokenA.toLowerCase()
    const b = tokenB.toLowerCase()
    const [token0, token1] = a < b ? [a, b] : [b, a]
    return `${factory.toLowerCase()}:${token0}:${token1}`
}

export interface V2RouteCandidate {
    dexId: DEXType
    factory: Address
    tokens: Address[]
}

function buildV2RouteCandidates(
    params: Omit<RouteQuoteParams, 'amountIn' | 'maxRouteQuotes'>
): V2RouteCandidate[] {
    const { chainId, tokenIn, tokenOut, connectors, dexId, maxHops = MAX_HOPS } = params

    const dexIds =
        dexId === undefined ? getDexes(chainId, 'v2').map((dex) => dex.dexId) : [dexId].flat()
    if (dexIds.length === 0) return []

    const candidates: V2RouteCandidate[] = []
    for (const id of dexIds) {
        const cfg = findDex(chainId, id, 'v2')
        if (!cfg?.factory) continue

        const resolve = (a: Address) => native.getSwapAddress(a, chainId, cfg.wnative)
        const rawPaths = enumerateHopPaths(
            resolve(tokenIn),
            resolve(tokenOut),
            connectors.map(resolve),
            maxHops
        )

        for (const tokens of rawPaths) {
            candidates.push({ dexId: id, factory: cfg.factory, tokens })
        }
    }
    return candidates
}

interface LegQuery {
    call: ContractCall
    key: string
}

function collectLegQueries(candidates: readonly V2RouteCandidate[]): LegQuery[] {
    const seen = new Map<string, LegQuery>()
    for (const c of candidates) {
        for (let i = 0; i < c.tokens.length - 1; i++) {
            const a = c.tokens[i]!
            const b = c.tokens[i + 1]!
            const key = pairKey(c.factory, a, b)
            if (seen.has(key)) continue
            seen.set(key, {
                key,
                call: {
                    address: c.factory,
                    abi: V2_FACTORY_ABI as Abi,
                    functionName: 'getPair',
                    args: [a, b],
                },
            })
        }
    }
    return [...seen.values()]
}

function buildViableRoutes(
    candidates: readonly V2RouteCandidate[],
    existing: ReadonlyMap<string, Address>,
    maxRouteQuotes: number = MAX_ROUTE_QUOTES
): V2RouteCandidate[] {
    const viable: V2RouteCandidate[] = []
    for (const c of candidates) {
        let dead = false
        for (let i = 0; i < c.tokens.length - 1; i++) {
            if (!existing.has(pairKey(c.factory, c.tokens[i]!, c.tokens[i + 1]!))) {
                dead = true
                break
            }
        }
        if (dead) continue

        viable.push(c)
        if (viable.length >= maxRouteQuotes) return viable
    }
    return viable
}

export async function getV2Quotes(
    client: ReadClient,
    params: RouteQuoteParams
): Promise<V2QuoteOutcome[]> {
    const { chainId, amountIn, maxRouteQuotes = MAX_ROUTE_QUOTES, withPriceImpact = false } = params

    const candidates = buildV2RouteCandidates(params)
    if (candidates.length === 0) return []

    const legQueries = collectLegQueries(candidates)
    const pairResults = await batchRead(
        client,
        legQueries.map((q) => q.call)
    )

    const existing = new Map<string, Address>()
    legQueries.forEach((q, index) => {
        const result = pairResults[index]
        if (result?.status !== 'success') return
        const pair = result.result as Address | undefined
        if (pair && pair.toLowerCase() !== zeroAddress) existing.set(q.key, pair)
    })

    const viable = buildViableRoutes(candidates, existing, maxRouteQuotes)
    if (viable.length === 0) return []

    const quotes = await quoteWithReference(
        client,
        amountIn,
        viable,
        (candidate, amount) =>
            buildQuoteCall({
                protocol: 'v2',
                chainId,
                dexId: candidate.dexId,
                tokenIn: candidate.tokens[0]!,
                tokenOut: candidate.tokens[candidate.tokens.length - 1]!,
                amountIn: amount,
                path: candidate.tokens,
            }),
        (raw, candidate) =>
            fromAmountsOut(
                raw as readonly bigint[],
                candidate.tokens.length > 2 ? 200000n : 150000n
            ),
        { withReference: withPriceImpact }
    )

    const outcomes = quotes.map(({ target, quote, priceImpact, error }): V2QuoteOutcome => {
        const filled = quote && quote.amountOut > 0n ? quote : null
        const pair =
            target.tokens.length === 2
                ? (existing.get(pairKey(target.factory, target.tokens[0]!, target.tokens[1]!)) ??
                  null)
                : null

        return {
            dexId: target.dexId,
            path: target.tokens,
            pair,
            quote: filled,
            priceImpact: filled ? priceImpact : undefined,
            error: filled ? null : (error ?? new Error(`Quote failed for ${target.dexId}`)),
        }
    })

    return sortByAmountOut(outcomes)
}

import { zeroAddress, type Abi, type Address } from 'viem'
import { V3_FACTORY_ABI } from '../abis/v3-factory.js'
import { findDex, getDexes, type DEXType } from '../configs/dex.js'
import * as native from './native.js'
import { batchRead, type ReadClient } from './multicall.js'
import {
    buildQuoteCall,
    fromQuoterV2,
    quoteWithReference,
    sortByAmountOut,
    type QuoteResult,
    type RouteQuoteParams,
} from './quote-call.js'
import type { ContractCall } from './plan-swap.js'

export const MAX_HOPS = 3
const MAX_DEEP_CONNECTORS = 3
export const MAX_ROUTE_QUOTES = 80

export interface V3QuoteOutcome {
    dexId: DEXType
    path: Address[]
    fees: number[]
    pool: Address | null
    quote: QuoteResult | null
    priceImpact: number | undefined
    error: Error | null
}

export function enumerateHopPaths(
    tokenIn: Address,
    tokenOut: Address,
    connectors: Address[],
    maxHops: number = MAX_HOPS
): Address[][] {
    const inL = tokenIn.toLowerCase()
    const outL = tokenOut.toLowerCase()
    const conns = connectors.filter((c) => {
        const l = c.toLowerCase()
        return l !== inL && l !== outL
    })

    const paths: Address[][] = [[tokenIn, tokenOut]]

    if (maxHops >= 2) {
        for (const c of conns) paths.push([tokenIn, c, tokenOut])
    }

    if (maxHops >= 3) {
        const deep = conns.slice(0, MAX_DEEP_CONNECTORS)
        for (const c1 of deep) {
            for (const c2 of deep) {
                if (c1.toLowerCase() === c2.toLowerCase()) continue
                paths.push([tokenIn, c1, c2, tokenOut])
            }
        }
    }

    return paths.filter((p) => new Set(p.map((t) => t.toLowerCase())).size === p.length)
}

function crossProduct(perLeg: number[][]): number[][] {
    return perLeg.reduce<number[][]>(
        (acc, fees) => acc.flatMap((combo) => fees.map((f) => [...combo, f])),
        [[]]
    )
}

export function poolKey(factory: Address, tokenA: Address, tokenB: Address, fee: number): string {
    const a = tokenA.toLowerCase()
    const b = tokenB.toLowerCase()
    const [token0, token1] = a < b ? [a, b] : [b, a]
    return `${factory.toLowerCase()}:${token0}:${token1}:${fee}`
}

export interface V3RouteCandidate {
    dexId: DEXType
    factory: Address
    feeTiers: number[]
    tokens: Address[]
}

function buildRouteCandidates(
    params: Omit<RouteQuoteParams, 'amountIn' | 'maxRouteQuotes'>
): V3RouteCandidate[] {
    const { chainId, tokenIn, tokenOut, connectors, dexId, maxHops = MAX_HOPS } = params

    const dexIds =
        dexId === undefined ? getDexes(chainId, 'v3').map((dex) => dex.dexId) : [dexId].flat()
    if (dexIds.length === 0) return []

    const resolve = (a: Address) => native.getSwapAddress(a, chainId)
    const rawPaths = enumerateHopPaths(
        resolve(tokenIn),
        resolve(tokenOut),
        connectors.map(resolve),
        maxHops
    )
    if (rawPaths.length === 0) return []

    const candidates: V3RouteCandidate[] = []
    for (const id of dexIds) {
        const cfg = findDex(chainId, id, 'v3')
        if (!cfg?.factory || !cfg?.quoter) continue
        const feeTiers = cfg.feeTiers

        for (const tokens of rawPaths) {
            candidates.push({ dexId: id, factory: cfg.factory, feeTiers, tokens })
        }
    }
    return candidates
}

interface LegQuery {
    call: ContractCall
    key: string
}

function collectLegQueries(candidates: readonly V3RouteCandidate[]): LegQuery[] {
    const seen = new Map<string, LegQuery>()
    for (const c of candidates) {
        for (let i = 0; i < c.tokens.length - 1; i++) {
            const a = c.tokens[i]!
            const b = c.tokens[i + 1]!
            for (const fee of c.feeTiers) {
                const key = poolKey(c.factory, a, b, fee)
                if (seen.has(key)) continue
                seen.set(key, {
                    key,
                    call: {
                        address: c.factory,
                        abi: V3_FACTORY_ABI as Abi,
                        functionName: 'getPool',
                        args: [a, b, fee],
                    },
                })
            }
        }
    }
    return [...seen.values()]
}

interface RouteMeta {
    candidate: V3RouteCandidate
    fees: number[]
}

function buildRouteMetas(
    candidates: readonly V3RouteCandidate[],
    existing: ReadonlyMap<string, Address>,
    maxRouteQuotes: number = MAX_ROUTE_QUOTES
): RouteMeta[] {
    const metas: RouteMeta[] = []
    for (const c of candidates) {
        const perLegFees: number[][] = []
        let dead = false
        for (let i = 0; i < c.tokens.length - 1; i++) {
            const fees = c.feeTiers.filter((fee) =>
                existing.has(poolKey(c.factory, c.tokens[i]!, c.tokens[i + 1]!, fee))
            )
            if (fees.length === 0) {
                dead = true
                break
            }
            perLegFees.push(fees)
        }
        if (dead) continue

        for (const fees of crossProduct(perLegFees)) {
            metas.push({ candidate: c, fees })
            if (metas.length >= maxRouteQuotes) return metas
        }
    }
    return metas
}

function decodeV3Quote(raw: unknown, meta: RouteMeta): QuoteResult {
    if (meta.candidate.tokens.length === 2) {
        return fromQuoterV2(raw as [bigint, bigint, number | bigint, bigint])
    }
    const [amountOut, , , gasEstimate] = raw as [bigint, bigint[], number[], bigint]
    return {
        amountOut,
        sqrtPriceX96After: 0n,
        initializedTicksCrossed: 0,
        gasEstimate: gasEstimate ?? 0n,
    }
}

export async function getV3Quotes(
    client: ReadClient,
    params: RouteQuoteParams
): Promise<V3QuoteOutcome[]> {
    const { chainId, amountIn, maxRouteQuotes = MAX_ROUTE_QUOTES, withPriceImpact = false } = params

    const candidates = buildRouteCandidates(params)
    if (candidates.length === 0) return []

    const legQueries = collectLegQueries(candidates)
    const poolResults = await batchRead(
        client,
        legQueries.map((q) => q.call)
    )

    const existing = new Map<string, Address>()
    legQueries.forEach((q, index) => {
        const result = poolResults[index]
        if (result?.status !== 'success') return
        const pool = result.result as Address | undefined
        if (pool && pool.toLowerCase() !== zeroAddress) existing.set(q.key, pool)
    })

    const metas = buildRouteMetas(candidates, existing, maxRouteQuotes)
    if (metas.length === 0) return []

    const quotes = await quoteWithReference(
        client,
        amountIn,
        metas,
        ({ candidate, fees }, amount) =>
            buildQuoteCall({
                protocol: 'v3',
                chainId,
                dexId: candidate.dexId,
                tokenIn: candidate.tokens[0]!,
                tokenOut: candidate.tokens[candidate.tokens.length - 1]!,
                amountIn: amount,
                path: candidate.tokens,
                fees,
            }),
        decodeV3Quote,
        { withReference: withPriceImpact }
    )

    const outcomes = quotes.map(({ target, quote, priceImpact, error }): V3QuoteOutcome => {
        const { candidate, fees } = target
        const filled = quote && quote.amountOut > 0n ? quote : null
        const pool =
            candidate.tokens.length === 2
                ? (existing.get(
                      poolKey(
                          candidate.factory,
                          candidate.tokens[0]!,
                          candidate.tokens[1]!,
                          fees[0]!
                      )
                  ) ?? null)
                : null

        return {
            dexId: candidate.dexId,
            path: candidate.tokens,
            fees,
            pool,
            quote: filled,
            priceImpact: filled ? priceImpact : undefined,
            error: filled ? null : (error ?? new Error(`Quote failed for ${candidate.dexId}`)),
        }
    })

    return sortByAmountOut(outcomes)
}

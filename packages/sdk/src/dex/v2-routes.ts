import { zeroAddress, type Abi, type Address } from 'viem'
import { UNISWAP_V2_FACTORY_ABI } from '../abis/uniswap-v2-factory.js'
import { getDexConfig, getSupportedDexs, ProtocolType, type DEXType } from '../configs/dex.js'
import { getSwapAddress } from './native.js'
import { batchRead, type ReadClient } from './multicall.js'
import {
    buildQuoteCall,
    fromAmountsOut,
    quoteWithReference,
    type QuoteParams,
    type QuoteResult,
} from './quote-call.js'
import { enumerateHopPaths, MAX_HOPS, MAX_ROUTE_QUOTES } from './v3-routes.js'
import type { ContractCall } from './plan-swap.js'

export interface V2RouteQuote {
    dexId: DEXType
    path: Address[]
    quote: QuoteResult
}

export interface V2RouteParams {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    connectors: Address[]
    dexId?: DEXType | DEXType[]
    maxHops?: number
    maxRouteQuotes?: number
}

export function pairKey(factory: Address, tokenA: Address, tokenB: Address): string {
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

export function buildV2RouteCandidates(
    params: Omit<V2RouteParams, 'amountIn' | 'maxRouteQuotes'>
): V2RouteCandidate[] {
    const { chainId, tokenIn, tokenOut, connectors, dexId, maxHops = MAX_HOPS } = params

    const dexIds = dexId === undefined ? getSupportedDexs(chainId, ProtocolType.V2) : [dexId].flat()
    if (dexIds.length === 0) return []

    const rawPaths = enumerateHopPaths(tokenIn, tokenOut, connectors, maxHops)
    if (rawPaths.length === 0) return []

    const candidates: V2RouteCandidate[] = []
    for (const id of dexIds) {
        const cfg = getDexConfig(chainId, id, ProtocolType.V2)
        if (!cfg?.factory) continue

        for (const rawPath of rawPaths) {
            const tokens = rawPath.map((a) => getSwapAddress(a, chainId, cfg.wnative))
            const collapsed = tokens.some(
                (t, i) => i > 0 && t.toLowerCase() === tokens[i - 1]!.toLowerCase()
            )
            if (collapsed) continue
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
                    abi: UNISWAP_V2_FACTORY_ABI as Abi,
                    functionName: 'getPair',
                    args: [a, b],
                },
            })
        }
    }
    return [...seen.values()]
}

export function buildViableRoutes(
    candidates: readonly V2RouteCandidate[],
    existing: ReadonlySet<string>,
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

export async function getV2Routes(
    client: ReadClient,
    params: V2RouteParams
): Promise<V2RouteQuote[]> {
    const { chainId, amountIn, maxRouteQuotes = MAX_ROUTE_QUOTES } = params

    const candidates = buildV2RouteCandidates(params)
    if (candidates.length === 0) return []

    const legQueries = collectLegQueries(candidates)
    const pairResults = await batchRead(
        client,
        legQueries.map((q) => q.call)
    )

    const existing = new Set<string>()
    legQueries.forEach((q, index) => {
        const result = pairResults[index]
        if (result?.status !== 'success') return
        const pair = result.result as Address | undefined
        if (pair && pair.toLowerCase() !== zeroAddress) existing.add(q.key)
    })

    const viable = buildViableRoutes(candidates, existing, maxRouteQuotes)
    if (viable.length === 0) return []

    const quoteEntries = viable.flatMap((candidate) => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V2,
            chainId,
            dexId: candidate.dexId,
            tokenIn: candidate.tokens[0]!,
            tokenOut: candidate.tokens[candidate.tokens.length - 1]!,
            amountIn,
            path: candidate.tokens,
        })
        return call ? [{ candidate, call }] : []
    })

    const quoteResults = await batchRead(
        client,
        quoteEntries.map((e) => e.call)
    )

    const routes: V2RouteQuote[] = []
    quoteResults.forEach((result, index) => {
        if (result?.status !== 'success') return
        const amounts = result.result as readonly bigint[]
        const quote = fromAmountsOut(amounts, 200000n)
        if (quote.amountOut === 0n) return

        const { candidate } = quoteEntries[index]!
        routes.push({ dexId: candidate.dexId, path: candidate.tokens, quote })
    })

    return routes.sort((a, b) => {
        if (a.quote.amountOut === b.quote.amountOut) return 0
        return a.quote.amountOut > b.quote.amountOut ? -1 : 1
    })
}

export type V2QuoteParams = QuoteParams

export interface V2QuoteOutcome {
    dexId: DEXType
    quote: QuoteResult | null
    pair: Address | null
    priceImpact: number | undefined
    error: Error | null
}

export async function discoverV2Pairs(
    client: ReadClient,
    params: Omit<V2QuoteParams, 'amountIn'>
): Promise<Map<DEXType, Address>> {
    const { chainId, tokenIn, tokenOut, dexId } = params

    const dexIds = dexId === undefined ? getSupportedDexs(chainId, ProtocolType.V2) : [dexId].flat()
    const entries = dexIds.flatMap((id) => {
        const config = getDexConfig(chainId, id, ProtocolType.V2)
        if (!config) return []
        const resolvedIn = getSwapAddress(tokenIn, chainId, config.wnative)
        const resolvedOut = getSwapAddress(tokenOut, chainId, config.wnative)
        if (resolvedIn.toLowerCase() === resolvedOut.toLowerCase()) return []
        return [{ dexId: id, factory: config.factory, tokenIn: resolvedIn, tokenOut: resolvedOut }]
    })
    if (entries.length === 0) return new Map()

    const results = await batchRead(
        client,
        entries.map((e) => ({
            address: e.factory,
            abi: UNISWAP_V2_FACTORY_ABI as Abi,
            functionName: 'getPair',
            args: [e.tokenIn, e.tokenOut],
        }))
    )

    const pairs = new Map<DEXType, Address>()
    entries.forEach((e, index) => {
        const result = results[index]
        if (result?.status !== 'success') return
        const pair = result.result as Address | undefined
        if (pair && pair.toLowerCase() !== zeroAddress) pairs.set(e.dexId, pair)
    })
    return pairs
}

export async function quoteV2Pairs(
    client: ReadClient,
    params: Omit<V2QuoteParams, 'dexId'>,
    pairs: ReadonlyMap<DEXType, Address>
): Promise<Map<DEXType, V2QuoteOutcome>> {
    const { chainId, tokenIn, tokenOut, amountIn } = params

    const quotes = await quoteWithReference(
        client,
        amountIn,
        [...pairs.entries()],
        ([dexId], amount) =>
            buildQuoteCall({
                protocol: ProtocolType.V2,
                chainId,
                dexId,
                tokenIn,
                tokenOut,
                amountIn: amount,
            }),
        (raw) => fromAmountsOut(raw as readonly bigint[])
    )

    const outcomes = new Map<DEXType, V2QuoteOutcome>()
    for (const { target, quote, priceImpact, error } of quotes) {
        const [dexId, pair] = target
        outcomes.set(dexId, {
            dexId,
            quote,
            pair,
            priceImpact,
            error: quote ? null : (error ?? new Error(`Quote failed for ${dexId}`)),
        })
    }
    return outcomes
}

export interface V2QuoteResult {
    direct: Map<DEXType, V2QuoteOutcome>
    routes: V2RouteQuote[]
}

async function getDirectQuotes(
    client: ReadClient,
    params: V2QuoteParams
): Promise<Map<DEXType, V2QuoteOutcome>> {
    const pairs = await discoverV2Pairs(client, params)
    if (pairs.size === 0) return new Map()

    return quoteV2Pairs(client, params, pairs)
}

export async function getV2Quotes(
    client: ReadClient,
    params: V2QuoteParams
): Promise<V2QuoteResult> {
    const { connectors, includeDirect = true } = params

    const [direct, routes] = await Promise.all([
        includeDirect
            ? getDirectQuotes(client, params)
            : Promise.resolve(new Map<DEXType, V2QuoteOutcome>()),
        connectors && connectors.length > 0
            ? getV2Routes(client, { ...params, connectors })
            : Promise.resolve<V2RouteQuote[]>([]),
    ])

    return { direct, routes }
}

import { zeroAddress, type Abi, type Address } from 'viem'
import { UNISWAP_V3_FACTORY_ABI } from '../abis/uniswap-v3-factory.js'
import { UNISWAP_V3_POOL_ABI } from '../abis/uniswap-v3-pool.js'
import { getDexConfig, ProtocolType, getSupportedDexs, type DEXType } from '../configs/dex.js'
import { getSwapAddress } from './native.js'
import { batchRead, type ReadClient, type ReadResult } from './multicall.js'
import {
    buildQuoteCall,
    fromQuoterV2,
    quoteWithReference,
    type QuoteParams,
    type QuoteResult,
} from './quote-call.js'
import type { ContractCall } from './plan-swap.js'

export const MAX_HOPS = 3
export const MAX_DEEP_CONNECTORS = 3
export const MAX_ROUTE_QUOTES = 80

export interface V3RouteQuote {
    dexId: DEXType
    path: Address[]
    fees: number[]
    quote: QuoteResult
}

interface V3RouteParams {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    connectors: Address[]
    dexId?: DEXType | DEXType[]
    maxHops?: number
    maxRouteQuotes?: number
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

    const paths: Address[][] = []
    for (const c of conns) paths.push([tokenIn, c, tokenOut])

    if (maxHops >= 3) {
        const deep = conns.slice(0, MAX_DEEP_CONNECTORS)
        for (const c1 of deep) {
            for (const c2 of deep) {
                if (c1.toLowerCase() === c2.toLowerCase()) continue
                paths.push([tokenIn, c1, c2, tokenOut])
            }
        }
    }
    return paths
}

export function crossProduct(perLeg: number[][]): number[][] {
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

export function buildRouteCandidates(
    params: Omit<V3RouteParams, 'amountIn' | 'maxRouteQuotes'>
): V3RouteCandidate[] {
    const { chainId, tokenIn, tokenOut, connectors, dexId, maxHops = MAX_HOPS } = params

    const dexIds = dexId === undefined ? getSupportedDexs(chainId, ProtocolType.V3) : [dexId].flat()
    if (dexIds.length === 0) return []

    const rawPaths = enumerateHopPaths(tokenIn, tokenOut, connectors, maxHops)
    if (rawPaths.length === 0) return []

    const candidates: V3RouteCandidate[] = []
    for (const id of dexIds) {
        const cfg = getDexConfig(chainId, id, ProtocolType.V3)
        if (!cfg?.factory || !cfg?.quoter) continue
        const feeTiers = cfg.feeTiers

        for (const rawPath of rawPaths) {
            const tokens = rawPath.map((a) => getSwapAddress(a, chainId))
            const collapsed = tokens.some(
                (t, i) => i > 0 && t.toLowerCase() === tokens[i - 1]!.toLowerCase()
            )
            if (collapsed) continue
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
                        abi: UNISWAP_V3_FACTORY_ABI as Abi,
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

export function buildRouteMetas(
    candidates: readonly V3RouteCandidate[],
    existing: ReadonlySet<string>,
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

export async function getV3Routes(
    client: ReadClient,
    params: V3RouteParams
): Promise<V3RouteQuote[]> {
    const { chainId, amountIn, maxRouteQuotes = MAX_ROUTE_QUOTES } = params

    const candidates = buildRouteCandidates(params)
    if (candidates.length === 0) return []

    const legQueries = collectLegQueries(candidates)
    const poolResults = await batchRead(
        client,
        legQueries.map((q) => q.call)
    )

    const existing = new Set<string>()
    legQueries.forEach((q, index) => {
        const result = poolResults[index]
        if (result?.status !== 'success') return
        const pool = result.result as Address | undefined
        if (pool && pool.toLowerCase() !== zeroAddress) existing.add(q.key)
    })

    const metas = buildRouteMetas(candidates, existing, maxRouteQuotes)
    if (metas.length === 0) return []

    const quoteEntries = metas.flatMap((meta) => {
        const { candidate, fees } = meta
        const call = buildQuoteCall({
            protocol: ProtocolType.V3,
            chainId,
            dexId: candidate.dexId,
            tokenIn: candidate.tokens[0]!,
            tokenOut: candidate.tokens[candidate.tokens.length - 1]!,
            amountIn,
            path: candidate.tokens,
            fees,
        })
        return call ? [{ meta, call }] : []
    })

    const quoteResults = await batchRead(
        client,
        quoteEntries.map((e) => e.call)
    )

    const routes: V3RouteQuote[] = []
    quoteResults.forEach((result, index) => {
        if (result?.status !== 'success') return
        const [amountOut, , , gasEstimate] = result.result as [bigint, bigint[], number[], bigint]
        if (!amountOut || amountOut === 0n) return

        const { candidate, fees } = quoteEntries[index]!.meta
        routes.push({
            dexId: candidate.dexId,
            path: candidate.tokens,
            fees,
            quote: {
                amountOut,
                sqrtPriceX96After: 0n,
                initializedTicksCrossed: 0,
                gasEstimate: gasEstimate ?? 0n,
            },
        })
    })

    return routes.sort((a, b) => {
        if (a.quote.amountOut === b.quote.amountOut) return 0
        return a.quote.amountOut > b.quote.amountOut ? -1 : 1
    })
}

export type V3QuoteParams = QuoteParams

export interface V3QuoteOutcome {
    dexId: DEXType
    quote: QuoteResult | null
    fee: number | null
    pool: Address | null
    priceImpact: number | undefined
    error: Error | null
}

export interface V3PoolCandidate {
    dexId: DEXType
    factory: Address
    quoter: Address
    fee: number
    tokenIn: Address
    tokenOut: Address
}

interface BuildPoolCandidatesInput {
    chainId: number
    dexIds: readonly DEXType[]
    tokenIn: Address
    tokenOut: Address
}

export function buildPoolCandidates({
    chainId,
    dexIds,
    tokenIn,
    tokenOut,
}: BuildPoolCandidatesInput): V3PoolCandidate[] {
    const resolvedIn = getSwapAddress(tokenIn, chainId)
    const resolvedOut = getSwapAddress(tokenOut, chainId)
    if (resolvedIn.toLowerCase() === resolvedOut.toLowerCase()) return []

    const candidates: V3PoolCandidate[] = []

    for (const dexId of dexIds) {
        const config = getDexConfig(chainId, dexId, ProtocolType.V3)
        if (!config) continue

        for (const fee of config.feeTiers) {
            candidates.push({
                dexId,
                factory: config.factory,
                quoter: config.quoter,
                fee,
                tokenIn: resolvedIn,
                tokenOut: resolvedOut,
            })
        }
    }

    return candidates
}

export interface ResolvedPool {
    candidate: V3PoolCandidate
    pool: Address
}

export interface DiscoveredV3Pool {
    dexId: DEXType
    pool: Address
    fee: number
    liquidity: bigint
}

export function resolvePoolAddresses(
    candidates: readonly V3PoolCandidate[],
    results: readonly ReadResult[]
): ResolvedPool[] {
    const resolved: ResolvedPool[] = []

    candidates.forEach((candidate, index) => {
        const result = results[index]
        if (result?.status !== 'success') return

        const pool = result.result as Address | undefined
        if (!pool || pool.toLowerCase() === zeroAddress) return

        resolved.push({ candidate, pool })
    })

    return resolved
}

export function pickBestPools(
    resolved: readonly ResolvedPool[],
    liquidityResults: readonly ReadResult[]
): Map<DEXType, DiscoveredV3Pool> {
    const best = new Map<DEXType, DiscoveredV3Pool>()

    resolved.forEach(({ candidate, pool }, index) => {
        const result = liquidityResults[index]
        if (result?.status !== 'success') return

        const liquidity = result.result as bigint | undefined
        if (typeof liquidity !== 'bigint' || liquidity <= 0n) return

        const incumbent = best.get(candidate.dexId)
        if (incumbent && incumbent.liquidity >= liquidity) return

        best.set(candidate.dexId, { dexId: candidate.dexId, pool, fee: candidate.fee, liquidity })
    })

    return best
}

async function discoverV3Pools(
    client: ReadClient,
    params: Omit<V3QuoteParams, 'amountIn'>
): Promise<Map<DEXType, DiscoveredV3Pool>> {
    const { chainId, tokenIn, tokenOut, dexId } = params

    const dexIds = dexId === undefined ? getSupportedDexs(chainId, ProtocolType.V3) : [dexId].flat()
    const candidates = buildPoolCandidates({ chainId, dexIds, tokenIn, tokenOut })
    if (candidates.length === 0) return new Map()

    const poolResults = await batchRead(
        client,
        candidates.map((candidate) => ({
            address: candidate.factory,
            abi: UNISWAP_V3_FACTORY_ABI as Abi,
            functionName: 'getPool',
            args: [candidate.tokenIn, candidate.tokenOut, candidate.fee],
        }))
    )
    const resolved = resolvePoolAddresses(candidates, poolResults)
    if (resolved.length === 0) return new Map()

    const liquidityResults = await batchRead(
        client,
        resolved.map(({ pool }) => ({
            address: pool,
            abi: UNISWAP_V3_POOL_ABI as Abi,
            functionName: 'liquidity',
            args: [],
        }))
    )

    return pickBestPools(resolved, liquidityResults)
}

export async function quoteV3Pools(
    client: ReadClient,
    params: Omit<V3QuoteParams, 'dexId'>,
    pools: ReadonlyMap<DEXType, DiscoveredV3Pool>
): Promise<Map<DEXType, V3QuoteOutcome>> {
    const { chainId, tokenIn, tokenOut, amountIn } = params

    const quotes = await quoteWithReference(
        client,
        amountIn,
        [...pools.entries()],
        ([dexId, pool], amount) =>
            buildQuoteCall({
                protocol: ProtocolType.V3,
                chainId,
                dexId,
                tokenIn,
                tokenOut,
                fee: pool.fee,
                amountIn: amount,
            }),
        (raw) => fromQuoterV2(raw as [bigint, bigint, number | bigint, bigint])
    )

    const outcomes = new Map<DEXType, V3QuoteOutcome>()
    for (const { target, quote, priceImpact, error } of quotes) {
        const [dexId, pool] = target
        outcomes.set(dexId, {
            dexId,
            quote,
            fee: pool.fee,
            pool: pool.pool,
            priceImpact,
            error: quote ? null : (error ?? new Error(`Quote failed for ${dexId}`)),
        })
    }
    return outcomes
}

export interface V3QuoteResult {
    direct: Map<DEXType, V3QuoteOutcome>
    routes: V3RouteQuote[]
}

async function getDirectQuotes(
    client: ReadClient,
    params: V3QuoteParams
): Promise<Map<DEXType, V3QuoteOutcome>> {
    const pools = await discoverV3Pools(client, params)
    if (pools.size === 0) return new Map()

    return quoteV3Pools(client, params, pools)
}

export async function getV3Quotes(
    client: ReadClient,
    params: V3QuoteParams
): Promise<V3QuoteResult> {
    const { connectors, includeDirect = true } = params

    const [direct, routes] = await Promise.all([
        includeDirect
            ? getDirectQuotes(client, params)
            : Promise.resolve(new Map<DEXType, V3QuoteOutcome>()),
        connectors && connectors.length > 0
            ? getV3Routes(client, { ...params, connectors })
            : Promise.resolve<V3RouteQuote[]>([]),
    ])

    return { direct, routes }
}

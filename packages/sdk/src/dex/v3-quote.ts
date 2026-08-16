import type { Address } from 'viem'
import { ProtocolType, type DEXType } from '../configs/dex-config.js'
import { batchRead, type ReadClient } from './multicall.js'
import { buildQuoteCall } from './quote.js'
import {
    buildGetPoolCalls,
    buildLiquidityCalls,
    buildPoolCandidates,
    pickBestPools,
    resolveDexIds,
    resolvePoolAddresses,
    type DiscoveredV3Pool,
} from './v3-pools.js'
import { getV3Routes, type V3RouteQuote } from './v3-routes.js'

export interface QuoteResult {
    amountOut: bigint
    sqrtPriceX96After: bigint
    initializedTicksCrossed: number
    gasEstimate: bigint
}

export function wrapQuoteResult(amountIn: bigint, operation: 'wrap' | 'unwrap'): QuoteResult {
    return {
        amountOut: amountIn,
        sqrtPriceX96After: 0n,
        initializedTicksCrossed: 0,
        gasEstimate: operation === 'wrap' ? 50000n : 40000n,
    }
}

export function fromQuoterV2(
    tuple: readonly [bigint, bigint, number | bigint, bigint]
): QuoteResult {
    return {
        amountOut: tuple[0],
        sqrtPriceX96After: tuple[1],
        initializedTicksCrossed: Number(tuple[2]),
        gasEstimate: tuple[3],
    }
}

export interface V3QuoteParams {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    dexId?: DEXType | DEXType[]
    connectors?: Address[]
    maxHops?: number
    maxRouteQuotes?: number
    includeDirect?: boolean
}

export interface V3QuoteResult {
    direct: Map<DEXType, V3QuoteOutcome>
    routes: V3RouteQuote[]
}

export interface V3QuoteOutcome {
    dexId: DEXType
    quote: QuoteResult | null
    fee: number | null
    pool: Address | null
    error: Error | null
}

export async function discoverV3Pools(
    client: ReadClient,
    params: Omit<V3QuoteParams, 'amountIn'>
): Promise<Map<DEXType, DiscoveredV3Pool>> {
    const { chainId, tokenIn, tokenOut, dexId } = params

    const dexIds = resolveDexIds(chainId, ProtocolType.V3, dexId)
    const candidates = buildPoolCandidates({ chainId, dexIds, tokenIn, tokenOut })
    if (candidates.length === 0) return new Map()

    const poolResults = await batchRead(client, buildGetPoolCalls(candidates))
    const resolved = resolvePoolAddresses(candidates, poolResults)
    if (resolved.length === 0) return new Map()

    const liquidityResults = await batchRead(
        client,
        buildLiquidityCalls(resolved.map(({ pool }) => pool))
    )

    return pickBestPools(resolved, liquidityResults)
}

export async function quoteV3Pools(
    client: ReadClient,
    params: Omit<V3QuoteParams, 'dexId'>,
    pools: ReadonlyMap<DEXType, DiscoveredV3Pool>
): Promise<Map<DEXType, V3QuoteOutcome>> {
    const { chainId, tokenIn, tokenOut, amountIn } = params

    const entries = [...pools.entries()].flatMap(([dexId, pool]) => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V3,
            chainId,
            dexId,
            tokenIn,
            tokenOut,
            amountIn,
            fee: pool.fee,
        })
        return call ? [{ dexId, pool, call }] : []
    })

    const results = await batchRead(
        client,
        entries.map(({ call }) => call)
    )

    const outcomes = new Map<DEXType, V3QuoteOutcome>()

    entries.forEach(({ dexId, pool }, index) => {
        const result = results[index]

        if (result?.status === 'success') {
            outcomes.set(dexId, {
                dexId,
                quote: fromQuoterV2(result.result as [bigint, bigint, number | bigint, bigint]),
                fee: pool.fee,
                pool: pool.pool,
                error: null,
            })
            return
        }

        outcomes.set(dexId, {
            dexId,
            quote: null,
            fee: pool.fee,
            pool: pool.pool,
            error: result?.error ?? new Error(`Quote failed for ${dexId}`),
        })
    })

    return outcomes
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

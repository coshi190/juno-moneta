import { zeroAddress, type Abi, type Address } from 'viem'
import { UNISWAP_V2_FACTORY_ABI } from '../abis/index.js'
import { ProtocolType, getV2Config, type DEXType } from '../configs/dex-config.js'
import { getSwapAddress } from './native.js'
import { batchRead, type ReadClient } from './multicall.js'
import { buildQuoteCall } from './quote-call.js'
import { resolveDexIds } from './v3-pools.js'
import type { QuoteResult } from './v3-quote.js'
import { getV2Routes, type V2RouteQuote } from './v2-routes.js'

export function fromAmountsOut(amounts: readonly bigint[], gasEstimate = 150000n): QuoteResult {
    return {
        amountOut: amounts[amounts.length - 1] ?? 0n,
        sqrtPriceX96After: 0n,
        initializedTicksCrossed: 0,
        gasEstimate,
    }
}

export interface V2QuoteParams {
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

export interface V2QuoteResult {
    direct: Map<DEXType, V2QuoteOutcome>
    routes: V2RouteQuote[]
}

export interface V2QuoteOutcome {
    dexId: DEXType
    quote: QuoteResult | null
    pair: Address | null
    error: Error | null
}

export async function discoverV2Pairs(
    client: ReadClient,
    params: Omit<V2QuoteParams, 'amountIn'>
): Promise<Map<DEXType, Address>> {
    const { chainId, tokenIn, tokenOut, dexId } = params

    const dexIds = resolveDexIds(chainId, ProtocolType.V2, dexId)
    const entries = dexIds.flatMap((id) => {
        const config = getV2Config(chainId, id)
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

    const entries = [...pairs.entries()].flatMap(([dexId, pair]) => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V2,
            chainId,
            dexId,
            tokenIn,
            tokenOut,
            amountIn,
        })
        return call ? [{ dexId, pair, call }] : []
    })

    const results = await batchRead(
        client,
        entries.map(({ call }) => call)
    )

    const outcomes = new Map<DEXType, V2QuoteOutcome>()

    entries.forEach(({ dexId, pair }, index) => {
        const result = results[index]

        if (result?.status === 'success') {
            outcomes.set(dexId, {
                dexId,
                quote: fromAmountsOut(result.result as readonly bigint[]),
                pair,
                error: null,
            })
            return
        }

        outcomes.set(dexId, {
            dexId,
            quote: null,
            pair,
            error: result?.error ?? new Error(`Quote failed for ${dexId}`),
        })
    })

    return outcomes
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

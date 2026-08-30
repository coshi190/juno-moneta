import { createPublicClient, http, parseUnits, type Address } from 'viem'
import {
    ERC20_ABI,
    ProtocolType,
    getAggRouterDeployment,
    getCrossDexQuote,
    getSplitQuote,
    getStablecoins,
    getSwapAddress,
    getV2Quotes,
    getV3Quotes,
    getWrappedNativeAddress,
    pickAggregatePlan,
    type PickedAggregatePlan,
    type ReadClient,
    type SplitRouteInput,
    type V2QuoteResult,
    type V3QuoteResult,
} from '@coshi190/juno-moneta-sdk'
import { UsageError } from './args.js'

export interface ResolvedAggregatePlan extends PickedAggregatePlan {
    bestSingleOut: bigint
}

export interface AggregatePlanParams {
    chainId: number
    tokenIn: string
    tokenOut: string
    amount: string
    rpcUrl: string
}

export function createReadClient(rpcUrl: string): ReadClient {
    return createPublicClient({ transport: http(rpcUrl) }) as unknown as ReadClient
}

function readErc20(client: ReadClient, token: Address, functionName: string): Promise<unknown> {
    return client.readContract({ address: token, abi: ERC20_ABI, functionName, args: [] })
}

function connectorsFor(chainId: number): Address[] {
    const wrapped = getWrappedNativeAddress(chainId)
    const stables = [...(getStablecoins(chainId) ?? [])] as Address[]
    const tokens = [...(wrapped ? [wrapped] : []), ...stables]
    return [...new Map(tokens.map((token) => [token.toLowerCase(), token])).values()]
}

function toSplitRoutes(
    tokenIn: Address,
    tokenOut: Address,
    v2: V2QuoteResult,
    v3: V3QuoteResult
): SplitRouteInput[] {
    const routes: SplitRouteInput[] = []
    const direct = { path: [tokenIn, tokenOut], isMultiHop: false }

    for (const [dexId, outcome] of v2.direct) {
        if (!outcome.quote) continue
        routes.push({
            dexId,
            protocolType: ProtocolType.V2,
            quote: { amountOut: outcome.quote.amountOut },
            route: { ...direct },
        })
    }
    for (const [dexId, outcome] of v3.direct) {
        if (!outcome.quote || outcome.fee === null) continue
        routes.push({
            dexId,
            protocolType: ProtocolType.V3,
            quote: { amountOut: outcome.quote.amountOut },
            route: { ...direct, fees: [outcome.fee] },
        })
    }
    for (const route of v2.routes) {
        routes.push({
            dexId: route.dexId,
            protocolType: ProtocolType.V2,
            quote: { amountOut: route.quote.amountOut },
            route: { path: route.path, isMultiHop: route.path.length > 2 },
        })
    }
    for (const route of v3.routes) {
        routes.push({
            dexId: route.dexId,
            protocolType: ProtocolType.V3,
            quote: { amountOut: route.quote.amountOut },
            route: { path: route.path, fees: route.fees, isMultiHop: route.path.length > 2 },
        })
    }
    return routes
}

async function symbolLookup(
    client: ReadClient,
    tokens: Address[]
): Promise<(token: Address) => string> {
    const unique = [...new Set(tokens.map((token) => token.toLowerCase()))] as Address[]
    const results = await Promise.allSettled(
        unique.map((token) => readErc20(client, token, 'symbol'))
    )

    const symbols = new Map<string, string>()
    results.forEach((result, i) => {
        if (result.status === 'fulfilled' && typeof result.value === 'string') {
            symbols.set(unique[i]!, result.value)
        }
    })

    return (token) => symbols.get(token.toLowerCase()) ?? `${token.slice(0, 6)}…${token.slice(-4)}`
}

export async function resolveAggregatePlan({
    chainId,
    tokenIn,
    tokenOut,
    amount,
    rpcUrl,
}: AggregatePlanParams): Promise<ResolvedAggregatePlan | null> {
    if (!getAggRouterDeployment(chainId)) {
        throw new UsageError(`no aggregation router deployed on chain ${chainId}`)
    }

    const [sell, buy] = [tokenIn as Address, tokenOut as Address]
    const client = createReadClient(rpcUrl)

    const decimals = await readErc20(client, getSwapAddress(sell, chainId), 'decimals')
    const amountIn = parseUnits(amount, Number(decimals))
    const connectors = connectorsFor(chainId)
    const params = { chainId, tokenIn: sell, tokenOut: buy, amountIn, connectors }

    const [v2, v3] = await Promise.all([getV2Quotes(client, params), getV3Quotes(client, params)])
    const routes = toSplitRoutes(sell, buy, v2, v3)

    const [split, crossDexLeg, symbolOf] = await Promise.all([
        getSplitQuote(client, { chainId, tokenIn: sell, tokenOut: buy, amountIn, routes }),
        getCrossDexQuote(client, params),
        symbolLookup(client, [
            getSwapAddress(sell, chainId),
            getSwapAddress(buy, chainId),
            ...connectors,
        ]),
    ])

    const picked = pickAggregatePlan({
        chainId,
        amountIn,
        aggFeeBps: split.aggFeeBps,
        allocation: split.allocation,
        crossDexLeg,
        symbolOf,
    })
    if (!picked) return null

    const bestSingleOut = routes.reduce(
        (best, route) => (route.quote.amountOut > best ? route.quote.amountOut : best),
        0n
    )
    return { ...picked, bestSingleOut }
}

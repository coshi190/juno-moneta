import { createPublicClient, http, parseUnits, type Abi, type Address } from 'viem'
import { getAbi, getAggregatePlan, getV2Quotes, getV3Quotes } from '@coshi190/juno-moneta-sdk'
import { getAggRouterDeployment, getStablecoins, getWrappedNativeAddress } from './config.js'
import { UsageError } from './args.js'

interface ContractCall {
    address: Address
    abi: Abi
    functionName: string
    args: readonly unknown[]
    value?: bigint
}

interface ReadClient {
    multicall(args: { contracts: readonly ContractCall[]; allowFailure: true }): Promise<unknown>
    readContract(args: ContractCall): Promise<unknown>
}

type PickedPlan = NonNullable<Awaited<ReturnType<typeof getAggregatePlan>>>

interface NamedHop {
    dexId: string
    symbolIn: string
    symbolOut: string
}

interface ResolvedAggregatePlan extends Omit<PickedPlan, 'legs'> {
    legs: { percent: number; hops: NamedHop[] }[]
}

interface AggregatePlanParams {
    chainId: number
    tokenIn: string
    tokenOut: string
    amount: string
    rpcUrl: string
}

function createReadClient(rpcUrl: string): ReadClient {
    return createPublicClient({ transport: http(rpcUrl) }) as unknown as ReadClient
}

function readErc20(client: ReadClient, token: Address, functionName: string): Promise<unknown> {
    return client.readContract({ address: token, abi: getAbi('erc20'), functionName, args: [] })
}

const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

function getSwapAddress(token: Address, chainId: number): Address {
    if (token.toLowerCase() !== NATIVE_TOKEN_ADDRESS) return token
    return getWrappedNativeAddress(chainId) ?? token
}

function connectorsFor(chainId: number): Address[] {
    const wrapped = getWrappedNativeAddress(chainId)
    const stables = [...(getStablecoins(chainId) ?? [])] as Address[]
    const tokens = [...(wrapped ? [wrapped] : []), ...stables]
    return [...new Map(tokens.map((token) => [token.toLowerCase(), token])).values()]
}

type V2Quotes = Awaited<ReturnType<typeof getV2Quotes>>
type V3Quotes = Awaited<ReturnType<typeof getV3Quotes>>

type Protocol = 'v2' | 'v3'

interface SplitRoute {
    dexId: string
    protocolType: Protocol
    quote: { amountOut: bigint }
    route: { path: Address[]; fees?: number[]; isMultiHop: boolean }
}

function toSplitRoutes(v2: V2Quotes, v3: V3Quotes): SplitRoute[] {
    const routes: SplitRoute[] = []

    for (const outcome of v2) {
        if (!outcome.quote) continue
        routes.push({
            dexId: outcome.dexId,
            protocolType: 'v2',
            quote: { amountOut: outcome.quote.amountOut },
            route: { path: outcome.path, isMultiHop: outcome.path.length > 2 },
        })
    }
    for (const outcome of v3) {
        if (!outcome.quote) continue
        routes.push({
            dexId: outcome.dexId,
            protocolType: 'v3',
            quote: { amountOut: outcome.quote.amountOut },
            route: {
                path: outcome.path,
                fees: outcome.fees,
                isMultiHop: outcome.path.length > 2,
            },
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

    const [v2Quotes, v3Quotes] = await Promise.all([
        getV2Quotes(client, params),
        getV3Quotes(client, params),
    ])
    const routes = toSplitRoutes(v2Quotes, v3Quotes)

    const [picked, symbolOf] = await Promise.all([
        getAggregatePlan(client, { ...params, routes }),
        symbolLookup(client, [
            getSwapAddress(sell, chainId),
            getSwapAddress(buy, chainId),
            ...connectors,
        ]),
    ])
    if (!picked) return null

    return {
        ...picked,
        legs: picked.legs.map((leg) => ({
            percent: leg.percent,
            hops: leg.hops.map((h) => ({
                dexId: h.dexId,
                symbolIn: symbolOf(h.tokenIn),
                symbolOut: symbolOf(h.tokenOut),
            })),
        })),
    }
}

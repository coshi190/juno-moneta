import type { PonderClient } from '../client.js'
import type {
    NativeUsdPrice,
    NativeUsdPriceSnapshot,
    V3Pool,
    V3PoolDayVolume,
    V3PoolState,
    V3Token,
    V3TokenSnapshot,
} from '../entities.js'
import { STABLECOIN_ADDRESSES, WRAPPED_NATIVE_ADDRESSES } from '../../configs/chains.js'
import {
    computePoolTvlUsd,
    computePoolVolumesUsd,
    priceFromSqrtPriceX96,
    type PoolBalances,
    type PoolUsdMeta,
} from '../../pool/pool-usd-math.js'
import { sel, MAX_LIMIT, type Items, type Page, type Row } from './internal.js'

const POOL_FIELDS = [
    'address',
    'token0',
    'token1',
    'fee',
    'tickSpacing',
] as const satisfies readonly (keyof V3Pool)[]

const TOKEN_FIELDS = [
    'id',
    'chainId',
    'address',
    'symbol',
    'name',
    'decimals',
] as const satisfies readonly (keyof V3Token)[]

const DAY_VOLUME_FIELDS = [
    'poolAddress',
    'dayTimestamp',
    'volumeToken0',
    'volumeToken1',
    'swapCount',
] as const satisfies readonly (keyof V3PoolDayVolume)[]

const POOL_STATE_FIELDS = [
    'poolAddress',
    'reserve0',
    'reserve1',
    'sqrtPriceX96',
    'tick',
    'liquidity',
] as const satisfies readonly (keyof V3PoolState)[]

const NATIVE_PRICE_FIELDS = [
    'chainId',
    'price',
] as const satisfies readonly (keyof NativeUsdPrice)[]

const SNAPSHOT_POINT_FIELDS = [
    'timestamp',
    'price',
] as const satisfies readonly (keyof NativeUsdPriceSnapshot)[]

const V3_TOKEN_PRICE_FIELDS = [
    'tokenAddr',
    'lastPriceNative',
    'lastPriceUsd',
] as const satisfies readonly (keyof V3TokenSnapshot)[]

export type V3PoolRow = Row<V3Pool, typeof POOL_FIELDS>
export type V3TokenRow = Row<V3Token, typeof TOKEN_FIELDS>
export type V3PoolDayVolumeRow = Row<V3PoolDayVolume, typeof DAY_VOLUME_FIELDS>
export type V3PoolStateRow = Row<V3PoolState, typeof POOL_STATE_FIELDS>
export type NativeUsdPricePoint = Row<NativeUsdPriceSnapshot, typeof SNAPSHOT_POINT_FIELDS>
export type V3TokenPrice = Row<V3TokenSnapshot, typeof V3_TOKEN_PRICE_FIELDS>

export function fetchV3Pools(
    client: PonderClient,
    {
        chainId,
        protocol = 'junoswap',
        limit = 500,
    }: { chainId: number; protocol?: string; limit?: number }
): Promise<V3PoolRow[]> {
    return client.fetchAllPages<{ v3Pools: Page<V3PoolRow> }, V3PoolRow>(
        `query V3Pools($chainId: Int!, $protocol: String!, $limit: Int!, $after: String) {
            v3Pools(
                where: { chainId: $chainId, protocol: $protocol }
                limit: $limit
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(POOL_FIELDS)} }
            }
        }`,
        { chainId, protocol, limit },
        (r) => r.v3Pools
    )
}

export async function fetchV3Tokens(
    client: PonderClient,
    { chainId, limit = 500 }: { chainId: number; limit?: number }
): Promise<V3TokenRow[]> {
    const data = await client.request<{ v3Tokens: Items<V3TokenRow> }>(
        `query V3Tokens($chainId: Int!, $limit: Int!) {
            v3Tokens(where: { chainId: $chainId }, limit: $limit) {
                items { ${sel(TOKEN_FIELDS)} }
            }
        }`,
        { chainId, limit }
    )
    return data.v3Tokens.items
}

export async function fetchV3PoolDayVolumes(
    client: PonderClient,
    {
        chainId,
        poolAddresses,
        since,
        limit = 1000,
    }: { chainId: number; poolAddresses: string[]; since: number; limit?: number }
): Promise<V3PoolDayVolumeRow[]> {
    if (poolAddresses.length === 0) return []
    const data = await client.request<{ v3PoolDayVolumes: Items<V3PoolDayVolumeRow> }>(
        `query V3PoolDayVolumes(
            $chainId: Int!, $poolAddresses: [String!], $since: Int!, $limit: Int!
        ) {
            v3PoolDayVolumes(
                where: {
                    chainId: $chainId
                    poolAddress_in: $poolAddresses
                    dayTimestamp_gte: $since
                }
                orderBy: "dayTimestamp"
                orderDirection: "desc"
                limit: $limit
            ) { items { ${sel(DAY_VOLUME_FIELDS)} } }
        }`,
        { chainId, poolAddresses, since, limit }
    )
    return data.v3PoolDayVolumes.items
}

export async function fetchV3PoolReserves(
    client: PonderClient,
    {
        chainId,
        poolAddresses,
        limit = 1000,
    }: { chainId: number; poolAddresses: string[]; limit?: number }
): Promise<V3PoolStateRow[]> {
    if (poolAddresses.length === 0) return []
    const data = await client.request<{ v3PoolStates: Items<V3PoolStateRow> }>(
        `query V3PoolStates($chainId: Int!, $poolAddresses: [String!], $limit: Int!) {
            v3PoolStates(
                where: { chainId: $chainId, poolAddress_in: $poolAddresses }
                limit: $limit
            ) { items { ${sel(POOL_STATE_FIELDS)} } }
        }`,
        { chainId, poolAddresses, limit }
    )
    return data.v3PoolStates.items
}

export async function fetchNativeUsdPrice(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<number | null> {
    const data = await client.request<{
        nativeUsdPrices: Items<Row<NativeUsdPrice, typeof NATIVE_PRICE_FIELDS>>
    }>(
        `query NativeUsdPrice($chainId: Int!) {
            nativeUsdPrices(where: { chainId: $chainId }, limit: 1) {
                items { ${sel(NATIVE_PRICE_FIELDS)} }
            }
        }`,
        { chainId }
    )
    const row = data.nativeUsdPrices.items[0]
    if (!row) return null
    const price = parseFloat(row.price)
    return Number.isFinite(price) ? price : null
}

export function fetchNativeUsdPriceSnapshots(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<NativeUsdPricePoint[]> {
    return client.fetchAllPages<
        { nativeUsdPriceSnapshots: Page<NativeUsdPricePoint> },
        NativeUsdPricePoint
    >(
        `query NativeUsdPriceSnapshots($chainId: Int!, $after: String) {
            nativeUsdPriceSnapshots(
                where: { chainId: $chainId }
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: ${MAX_LIMIT}
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(SNAPSHOT_POINT_FIELDS)} }
            }
        }`,
        { chainId },
        (r) => r.nativeUsdPriceSnapshots
    )
}

export async function fetchV3TokenSnapshots(
    client: PonderClient,
    { chainId, limit = 500 }: { chainId: number; limit?: number }
): Promise<V3TokenPrice[]> {
    const data = await client.request<{ v3TokenSnapshots: Items<V3TokenPrice> }>(
        `query V3TokenSnapshots($chainId: Int!, $limit: Int!) {
            v3TokenSnapshots(where: { chainId: $chainId }, limit: $limit) {
                items { ${sel(V3_TOKEN_PRICE_FIELDS)} }
            }
        }`,
        { chainId, limit }
    )
    return data.v3TokenSnapshots.items
}

export interface PoolMetricsToken {
    address: string
    symbol: string
    name: string
    decimals: number
}

export interface PoolMetrics {
    address: string
    fee: number
    tickSpacing: number
    token0: PoolMetricsToken
    token1: PoolMetricsToken
    sqrtPriceX96: bigint
    tick: number | null
    liquidity: bigint
    price: number
    tvlUsd: number | null
    volume1dUsd: number | null
    volume30dUsd: number | null
    feeAprPercent: number | null
}

const DAYS_PER_YEAR = 365
const VOLUME_WINDOW_DAYS = 30
const FEE_DENOMINATOR = 1_000_000
const VOLUME_LOOKBACK_SECONDS = 31 * 86400

export function computeFeeAprPercent(
    fee: number,
    tvlUsd: number | null,
    volume30dUsd: number
): number | null {
    if (tvlUsd === null || tvlUsd <= 0 || volume30dUsd <= 0) return null
    const dailyAvgVolume = volume30dUsd / VOLUME_WINDOW_DAYS
    return ((dailyAvgVolume * (fee / FEE_DENOMINATOR)) / tvlUsd) * DAYS_PER_YEAR * 100
}

function toMetricsToken(row: V3TokenRow | undefined, address: string): PoolMetricsToken {
    return {
        address,
        symbol: row?.symbol ?? '',
        name: row?.name ?? '',
        decimals: row?.decimals ?? 18,
    }
}

export function toTokenPriceMap(rows: V3TokenPrice[]): Map<string, number> {
    const priceMap = new Map<string, number>()
    for (const row of rows) {
        const price = row.lastPriceUsd === null ? NaN : parseFloat(row.lastPriceUsd)
        if (Number.isFinite(price)) priceMap.set(row.tokenAddr.toLowerCase(), price)
    }
    return priceMap
}

export async function fetchPoolMetrics(
    client: PonderClient,
    {
        chainId,
        protocol = 'junoswap',
        limit = 500,
        nowSeconds = Math.floor(Date.now() / 1000),
        tokens,
        tokenPrices,
    }: {
        chainId: number
        protocol?: string
        limit?: number
        nowSeconds?: number
        tokens?: V3TokenRow[]
        tokenPrices?: V3TokenPrice[]
    }
): Promise<PoolMetrics[]> {
    const pools = await fetchV3Pools(client, { chainId, protocol, limit })
    if (pools.length === 0) return []

    const poolAddresses = pools.map((pool) => pool.address.toLowerCase())
    const [tokenRows, reserves, dayVolumes, priceRows] = await Promise.all([
        tokens ?? fetchV3Tokens(client, { chainId, limit }),
        fetchV3PoolReserves(client, { chainId, poolAddresses }),
        fetchV3PoolDayVolumes(client, {
            chainId,
            poolAddresses,
            since: nowSeconds - VOLUME_LOOKBACK_SECONDS,
        }),
        tokenPrices ?? fetchV3TokenSnapshots(client, { chainId, limit }),
    ])

    const tokenMap = new Map(tokenRows.map((token) => [token.address.toLowerCase(), token]))
    const stateMap = new Map(reserves.map((row) => [row.poolAddress.toLowerCase(), row]))

    const priceMap = toTokenPriceMap(priceRows)

    const meta: PoolUsdMeta[] = []
    const balances = new Map<string, PoolBalances>()

    for (const pool of pools) {
        const key = pool.address.toLowerCase()
        const state = stateMap.get(key)
        const token0 = tokenMap.get(pool.token0.toLowerCase())
        const token1 = tokenMap.get(pool.token1.toLowerCase())
        meta.push({
            address: pool.address,
            token0: { address: pool.token0, decimals: token0?.decimals ?? 18 },
            token1: { address: pool.token1, decimals: token1?.decimals ?? 18 },
            sqrtPriceX96: state ? BigInt(state.sqrtPriceX96) : 0n,
        })
        if (state) {
            balances.set(key, {
                balance0: BigInt(state.reserve0),
                balance1: BigInt(state.reserve1),
            })
        }
    }

    const wrappedNative = WRAPPED_NATIVE_ADDRESSES[chainId]
    const usdStable = [...(STABLECOIN_ADDRESSES[chainId] ?? [])][0]

    const tvl = computePoolTvlUsd({
        pools: meta,
        balances,
        priceMap,
        ...(wrappedNative === undefined ? {} : { wrappedNative }),
        ...(usdStable === undefined ? {} : { usdStable }),
    })
    const volumes = computePoolVolumesUsd({
        rows: dayVolumes,
        pools: meta,
        priceMap,
        nowSeconds,
        ...(wrappedNative === undefined ? {} : { wrappedNative }),
        ...(usdStable === undefined ? {} : { usdStable }),
    })

    return pools.map((pool, index) => {
        const key = pool.address.toLowerCase()
        const state = stateMap.get(key)
        const entry = meta[index]!
        const tvlUsd = tvl[key] ?? null
        const volume = volumes[key]
        const volume30dUsd = volume?.volume30d ?? null

        return {
            address: pool.address,
            fee: pool.fee,
            tickSpacing: pool.tickSpacing,
            token0: toMetricsToken(tokenMap.get(pool.token0.toLowerCase()), pool.token0),
            token1: toMetricsToken(tokenMap.get(pool.token1.toLowerCase()), pool.token1),
            sqrtPriceX96: entry.sqrtPriceX96,
            tick: state?.tick ?? null,
            liquidity: state ? BigInt(state.liquidity) : 0n,
            price: priceFromSqrtPriceX96(
                entry.sqrtPriceX96,
                entry.token0.decimals,
                entry.token1.decimals
            ),
            tvlUsd,
            volume1dUsd: volume?.volume1d ?? null,
            volume30dUsd,
            feeAprPercent: computeFeeAprPercent(pool.fee, tvlUsd, volume30dUsd ?? 0),
        }
    })
}

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
import { getStablecoins, getWrappedNativeAddress } from '../../configs/chains.js'
import {
    computePoolTvlUsd,
    computePoolVolumesUsd,
    priceFromSqrtPriceX96,
} from '../../pool/pool-math.js'
import { fetchAllRows, type Items, type Row } from './internal.js'

const POOL_FIELDS = [
    'address',
    'token0',
    'token1',
    'fee',
    'tickSpacing',
    'protocol',
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
    'volumeUsd',
] as const satisfies readonly (keyof V3PoolDayVolume)[]

const POOL_STATE_FIELDS = [
    'poolAddress',
    'reserve0',
    'reserve1',
    'sqrtPriceX96',
    'tick',
    'liquidity',
] as const satisfies readonly (keyof V3PoolState)[]

const SNAPSHOT_POINT_FIELDS = [
    'timestamp',
    'price',
] as const satisfies readonly (keyof NativeUsdPriceSnapshot)[]

const V3_TOKEN_PRICE_FIELDS = [
    'tokenAddr',
    'lastPriceNative',
    'lastPriceUsd',
] as const satisfies readonly (keyof V3TokenSnapshot)[]

type V3TokenPriceRow = Row<V3TokenSnapshot, typeof V3_TOKEN_PRICE_FIELDS>
export type V3PoolRow = Row<V3Pool, typeof POOL_FIELDS>
export type V3TokenRow = Row<V3Token, typeof TOKEN_FIELDS> &
    Partial<Omit<V3TokenPriceRow, 'tokenAddr'>>
export type V3PoolDayVolumeRow = Row<V3PoolDayVolume, typeof DAY_VOLUME_FIELDS>
export type V3PoolStateRow = Row<V3PoolState, typeof POOL_STATE_FIELDS>
export type NativeUsdPricePoint = Row<NativeUsdPriceSnapshot, typeof SNAPSHOT_POINT_FIELDS>

export interface V3PoolFilter {
    chainId: number
    protocol?: string
    addresses?: string[]
}

export function fetchV3Pools(
    client: PonderClient,
    { chainId, protocol, addresses }: V3PoolFilter
): Promise<V3PoolRow[]> {
    if (addresses?.length === 0) return Promise.resolve([])
    const where = {
        chainId,
        protocol: protocol || undefined,
        address_in: addresses?.map((a) => a.toLowerCase()),
    }
    return fetchAllRows(client, 'v3Pool', where, POOL_FIELDS)
}

export async function fetchV3Tokens(
    client: PonderClient,
    { chainId, prices = false }: { chainId: number; prices?: boolean }
): Promise<V3TokenRow[]> {
    const [tokens, snapshots] = await Promise.all([
        fetchAllRows<V3TokenRow>(client, 'v3Token', { chainId }, TOKEN_FIELDS),
        prices
            ? fetchAllRows<V3TokenPriceRow>(
                  client,
                  'v3TokenSnapshot',
                  { chainId },
                  V3_TOKEN_PRICE_FIELDS
              )
            : null,
    ])
    if (!snapshots) return tokens
    const snapshotMap = new Map(snapshots.map((row) => [row.tokenAddr, row]))
    return tokens.map((token) => {
        const snapshot = snapshotMap.get(token.address)
        return {
            ...token,
            lastPriceNative: snapshot?.lastPriceNative ?? null,
            lastPriceUsd: snapshot?.lastPriceUsd ?? null,
        }
    })
}

export async function fetchNativeUsdPrice(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<number | null> {
    const data = await client.request<{ nativeUsdPrices: Items<Pick<NativeUsdPrice, 'price'>> }>(
        `query NativeUsdPrice($chainId: Int!) {
            nativeUsdPrices(where: { chainId: $chainId }, limit: 1) { items { price } }
        }`,
        { chainId }
    )
    const price = parseFloat(data.nativeUsdPrices.items[0]?.price ?? '')
    return Number.isFinite(price) ? price : null
}

export function fetchNativeUsdPriceSnapshots(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<NativeUsdPricePoint[]> {
    return fetchAllRows(
        client,
        'nativeUsdPriceSnapshot',
        { chainId },
        SNAPSHOT_POINT_FIELDS,
        'orderBy: "timestamp" orderDirection: "asc"'
    )
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

function computeFeeAprPercent(
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

export async function fetchPoolMetrics(
    client: PonderClient,
    { chainId, protocol = 'junoswap' }: { chainId: number; protocol?: string }
): Promise<PoolMetrics[]> {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const [pools, tokens] = await Promise.all([
        fetchV3Pools(client, { chainId, protocol }),
        fetchV3Tokens(client, { chainId, prices: true }),
    ])
    if (pools.length === 0) return []

    const poolAddress_in = pools.map((pool) => pool.address)
    const [states, dayVolumes] = await Promise.all([
        fetchAllRows<V3PoolStateRow>(
            client,
            'v3PoolState',
            { chainId, poolAddress_in },
            POOL_STATE_FIELDS
        ),
        fetchAllRows<V3PoolDayVolumeRow>(
            client,
            'v3PoolDayVolume',
            { chainId, poolAddress_in, dayTimestamp_gte: nowSeconds - VOLUME_LOOKBACK_SECONDS },
            DAY_VOLUME_FIELDS
        ),
    ])

    const tokenMap = new Map(tokens.map((token) => [token.address, token]))
    const stateMap = new Map(states.map((row) => [row.poolAddress, row]))
    const priceMap = new Map<string, number>()
    for (const token of tokens) {
        const price = parseFloat(token.lastPriceUsd ?? '')
        if (Number.isFinite(price)) priceMap.set(token.address, price)
    }

    const meta = pools.map((pool) => ({
        address: pool.address,
        token0: toMetricsToken(tokenMap.get(pool.token0), pool.token0),
        token1: toMetricsToken(tokenMap.get(pool.token1), pool.token1),
        sqrtPriceX96: BigInt(stateMap.get(pool.address)?.sqrtPriceX96 ?? 0),
    }))
    const balances = new Map(
        states.map((row) => [
            row.poolAddress,
            { balance0: BigInt(row.reserve0), balance1: BigInt(row.reserve1) },
        ])
    )

    const tvl = computePoolTvlUsd({
        pools: meta,
        balances,
        priceMap,
        wrappedNative: getWrappedNativeAddress(chainId),
        usdStable: getStablecoins(chainId)?.values().next().value,
    })
    const volumes = computePoolVolumesUsd({ rows: dayVolumes, nowSeconds })

    return pools.map((pool, index) => {
        const { token0, token1, sqrtPriceX96 } = meta[index]!
        const state = stateMap.get(pool.address)
        const tvlUsd = tvl[pool.address] ?? null
        const volume = volumes[pool.address]
        return {
            address: pool.address,
            fee: pool.fee,
            tickSpacing: pool.tickSpacing,
            token0,
            token1,
            sqrtPriceX96,
            tick: state?.tick ?? null,
            liquidity: BigInt(state?.liquidity ?? 0),
            price: priceFromSqrtPriceX96(sqrtPriceX96, token0.decimals, token1.decimals),
            tvlUsd,
            volume1dUsd: volume?.volume1d ?? null,
            volume30dUsd: volume?.volume30d ?? null,
            feeAprPercent: computeFeeAprPercent(pool.fee, tvlUsd, volume?.volume30d ?? 0),
        }
    })
}

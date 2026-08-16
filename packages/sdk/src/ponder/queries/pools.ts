import type { PonderClient } from '../client.js'
import type { V3Pool, V3PoolDayVolume, V3PoolState, V3PoolTvlDay, V3Token } from '../entities.js'
import { sel, type Items, type Row } from './internal.js'

const POOL_FIELDS = [
    'address',
    'token0',
    'token1',
    'fee',
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

const POOL_TVL_DAY_FIELDS = [
    'poolAddress',
    'dayTimestamp',
    'reserve0',
    'reserve1',
    'sqrtPriceX96',
] as const satisfies readonly (keyof V3PoolTvlDay)[]

export type V3PoolRow = Row<V3Pool, typeof POOL_FIELDS>
export type V3TokenRow = Row<V3Token, typeof TOKEN_FIELDS>
export type V3PoolDayVolumeRow = Row<V3PoolDayVolume, typeof DAY_VOLUME_FIELDS>
export type V3PoolStateRow = Row<V3PoolState, typeof POOL_STATE_FIELDS>
export type V3PoolTvlDayRow = Row<V3PoolTvlDay, typeof POOL_TVL_DAY_FIELDS>

export async function fetchV3Pools(
    client: PonderClient,
    {
        chainId,
        protocol = 'junoswap',
        limit = 500,
    }: { chainId: number; protocol?: string; limit?: number }
): Promise<V3PoolRow[]> {
    const data = await client.request<{ v3Pools: Items<V3PoolRow> }>(
        `query V3Pools($chainId: Int!, $protocol: String!, $limit: Int!) {
            v3Pools(where: { chainId: $chainId, protocol: $protocol }, limit: $limit) {
                items { ${sel(POOL_FIELDS)} }
            }
        }`,
        { chainId, protocol, limit }
    )
    return data.v3Pools.items
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

export async function fetchV3PoolTvlDays(
    client: PonderClient,
    {
        chainId,
        poolAddresses,
        since,
        limit = 1000,
    }: { chainId: number; poolAddresses: string[]; since: number; limit?: number }
): Promise<V3PoolTvlDayRow[]> {
    if (poolAddresses.length === 0) return []
    const data = await client.request<{ v3PoolTvlDays: Items<V3PoolTvlDayRow> }>(
        `query V3PoolTvlDays(
            $chainId: Int!, $poolAddresses: [String!], $since: Int!, $limit: Int!
        ) {
            v3PoolTvlDays(
                where: {
                    chainId: $chainId
                    poolAddress_in: $poolAddresses
                    dayTimestamp_gte: $since
                }
                orderBy: "dayTimestamp"
                orderDirection: "desc"
                limit: $limit
            ) { items { ${sel(POOL_TVL_DAY_FIELDS)} } }
        }`,
        { chainId, poolAddresses, since, limit }
    )
    return data.v3PoolTvlDays.items
}

export async function fetchGraduatedPool(
    client: PonderClient,
    {
        tokenAddr,
        wrappedNative,
        fee = 10000,
    }: { tokenAddr: string; wrappedNative: string; fee?: number }
): Promise<string | null> {
    const query = `query GraduatedPool($token0: String!, $token1: String!, $fee: Int!) {
        v3Pools(where: { token0: $token0, token1: $token1, fee: $fee }, limit: 1) {
            items { address }
        }
    }`
    type Response = { v3Pools: Items<Pick<V3Pool, 'address'>> }

    const direct = await client.request<Response>(query, {
        token0: tokenAddr,
        token1: wrappedNative,
        fee,
    })
    const hit = direct.v3Pools.items[0]
    if (hit) return hit.address

    const reversed = await client.request<Response>(query, {
        token0: wrappedNative,
        token1: tokenAddr,
        fee,
    })
    return reversed.v3Pools.items[0]?.address ?? null
}

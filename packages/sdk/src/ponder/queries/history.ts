import type { PonderClient } from '../client.js'
import type { SwapEvent, TokenCandle, V3SwapEvent } from '../entities.js'
import { sel, type Items, type Page, type Row } from './internal.js'

const BC_HISTORY_FIELDS = [
    'timestamp',
    'isBuy',
    'amountIn',
    'amountOut',
    'reserveIn',
    'reserveOut',
    'sender',
] as const satisfies readonly (keyof SwapEvent)[]

const V3_HISTORY_FIELDS = [
    'timestamp',
    'amount0',
    'amount1',
    'sqrtPriceX96',
    'tick',
    'txFrom',
    'tokenIsToken0',
] as const satisfies readonly (keyof V3SwapEvent)[]

const BC_PRICE_POINT_FIELDS = [
    'timestamp',
    'isBuy',
    'reserveIn',
    'reserveOut',
] as const satisfies readonly (keyof SwapEvent)[]

const V3_PRICE_POINT_FIELDS = [
    'timestamp',
    'sqrtPriceX96',
    'tokenIsToken0',
] as const satisfies readonly (keyof V3SwapEvent)[]

const POOL_POINT_FIELDS = [
    'timestamp',
    'sqrtPriceX96',
] as const satisfies readonly (keyof V3SwapEvent)[]

const CANDLE_FIELDS = [
    'bucketTs',
    'open',
    'high',
    'low',
    'close',
    'volumeNative',
] as const satisfies readonly (keyof TokenCandle)[]

export type TokenCandleRow = Row<TokenCandle, typeof CANDLE_FIELDS>

export type BondingCurveHistoryPoint = Row<SwapEvent, typeof BC_HISTORY_FIELDS>
export type V3HistoryPoint = Row<V3SwapEvent, typeof V3_HISTORY_FIELDS>
export type BondingCurvePricePoint = Row<SwapEvent, typeof BC_PRICE_POINT_FIELDS>
export type V3PricePoint = Row<V3SwapEvent, typeof V3_PRICE_POINT_FIELDS>
export type PoolPricePoint = Row<V3SwapEvent, typeof POOL_POINT_FIELDS>

export function fetchBondingCurveHistory(
    client: PonderClient,
    { tokenAddr }: { tokenAddr: string }
): Promise<BondingCurveHistoryPoint[]> {
    return client.fetchAllPages<
        { swapEvents: Page<BondingCurveHistoryPoint> },
        BondingCurveHistoryPoint
    >(
        `query BondingCurveHistory($tokenAddr: String!, $after: String) {
            swapEvents(
                where: { tokenAddr: $tokenAddr }
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(BC_HISTORY_FIELDS)} }
            }
        }`,
        { tokenAddr },
        (r) => r.swapEvents
    )
}

export function fetchV3History(
    client: PonderClient,
    { tokenAddr, chainId }: { tokenAddr: string; chainId: number }
): Promise<V3HistoryPoint[]> {
    return client.fetchAllPages<{ v3SwapEvents: Page<V3HistoryPoint> }, V3HistoryPoint>(
        `query V3History($tokenAddr: String!, $chainId: Int!, $after: String) {
            v3SwapEvents(
                where: { tokenAddr: $tokenAddr, chainId: $chainId }
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(V3_HISTORY_FIELDS)} }
            }
        }`,
        { tokenAddr, chainId },
        (r) => r.v3SwapEvents
    )
}

export function fetchTokenCandles(
    client: PonderClient,
    {
        tokenAddr,
        chainId,
        source,
        duration,
        since,
    }: { tokenAddr: string; chainId: number; source: 'bc' | 'v3'; duration: number; since: number }
): Promise<TokenCandleRow[]> {
    return client.fetchAllPages<{ tokenCandles: Page<TokenCandleRow> }, TokenCandleRow>(
        `query TokenCandles(
            $tokenAddr: String!, $chainId: Int!, $source: String!, $duration: Int!,
            $since: Int!, $after: String
        ) {
            tokenCandles(
                where: {
                    tokenAddr: $tokenAddr
                    chainId: $chainId
                    source: $source
                    duration: $duration
                    bucketTs_gte: $since
                }
                orderBy: "bucketTs"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(CANDLE_FIELDS)} }
            }
        }`,
        { tokenAddr, chainId, source, duration, since },
        (r) => r.tokenCandles
    )
}

export async function fetchBondingCurvePricesSince(
    client: PonderClient,
    { tokenAddr, since }: { tokenAddr: string; since: number }
): Promise<BondingCurvePricePoint[]> {
    const data = await client.request<{ swapEvents: Items<BondingCurvePricePoint> }>(
        `query BondingCurvePricesSince($tokenAddr: String!, $since: Int!) {
            swapEvents(
                where: { tokenAddr: $tokenAddr, timestamp_gte: $since }
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
            ) { items { ${sel(BC_PRICE_POINT_FIELDS)} } }
        }`,
        { tokenAddr, since }
    )
    return data.swapEvents.items
}

export async function fetchV3PricesSince(
    client: PonderClient,
    { tokenAddr, chainId, since }: { tokenAddr: string; chainId: number; since: number }
): Promise<V3PricePoint[]> {
    const data = await client.request<{ v3SwapEvents: Items<V3PricePoint> }>(
        `query V3PricesSince($tokenAddr: String!, $chainId: Int!, $since: Int!) {
            v3SwapEvents(
                where: { tokenAddr: $tokenAddr, chainId: $chainId, timestamp_gte: $since }
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
            ) { items { ${sel(V3_PRICE_POINT_FIELDS)} } }
        }`,
        { tokenAddr, chainId, since }
    )
    return data.v3SwapEvents.items
}

export function fetchPoolPriceHistory(
    client: PonderClient,
    { poolAddress, chainId, since }: { poolAddress: string; chainId: number; since: number }
): Promise<PoolPricePoint[]> {
    return client.fetchAllPages<{ v3SwapEvents: Page<PoolPricePoint> }, PoolPricePoint>(
        `query PoolPriceHistory($poolAddress: String!, $chainId: Int!, $since: Int!, $after: String) {
            v3SwapEvents(
                where: { poolAddress: $poolAddress, chainId: $chainId, timestamp_gt: $since }
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(POOL_POINT_FIELDS)} }
            }
        }`,
        { poolAddress, chainId, since },
        (r) => r.v3SwapEvents
    )
}

export async function fetchPoolPriceAnchor(
    client: PonderClient,
    { poolAddress, chainId, before }: { poolAddress: string; chainId: number; before: number }
): Promise<PoolPricePoint | null> {
    const data = await client.request<{ v3SwapEvents: Items<PoolPricePoint> }>(
        `query PoolPriceAnchor($poolAddress: String!, $chainId: Int!, $before: Int!) {
            v3SwapEvents(
                where: { poolAddress: $poolAddress, chainId: $chainId, timestamp_lte: $before }
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: 1
            ) { items { ${sel(POOL_POINT_FIELDS)} } }
        }`,
        { poolAddress, chainId, before }
    )
    return data.v3SwapEvents.items[0] ?? null
}

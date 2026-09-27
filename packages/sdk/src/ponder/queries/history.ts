import type { PonderClient } from '../client.js'
import type { SwapEvent, TokenCandle, V3SwapEvent } from '../entities.js'
import { sel, v3SwapWhere, MAX_LIMIT, type Items, type Page, type Row } from './internal.js'

const BC_PRICE_POINT_FIELDS = [
    'timestamp',
    'isBuy',
    'reserveIn',
    'reserveOut',
    'priceNative',
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
] as const satisfies readonly (keyof TokenCandle)[]

export type TokenCandleRow = Row<TokenCandle, typeof CANDLE_FIELDS>

export type BondingCurvePricePoint = Row<SwapEvent, typeof BC_PRICE_POINT_FIELDS>
export type V3PricePoint = Row<V3SwapEvent, typeof V3_PRICE_POINT_FIELDS>
export type PoolPricePoint = Row<V3SwapEvent, typeof POOL_POINT_FIELDS>

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
        `query TokenCandles($where: tokenCandleFilter, $after: String) {
            tokenCandles(
                where: $where orderBy: "bucketTs" orderDirection: "asc"
                limit: ${MAX_LIMIT} after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(CANDLE_FIELDS)} }
            }
        }`,
        { where: { tokenAddr, chainId, source, duration, bucketTs_gte: since } },
        (r) => r.tokenCandles
    )
}

export async function fetchBondingCurvePricesSince(
    client: PonderClient,
    { tokenAddr, since }: { tokenAddr: string; since: number }
): Promise<BondingCurvePricePoint[]> {
    const data = await client.request<{ swapEvents: Items<BondingCurvePricePoint> }>(
        `query BondingCurvePricesSince($where: swapEventFilter) {
            swapEvents(
                where: $where orderBy: "timestamp" orderDirection: "asc" limit: ${MAX_LIMIT}
            ) {
                items { ${sel(BC_PRICE_POINT_FIELDS)} }
            }
        }`,
        { where: { tokenAddr, timestamp_gte: since } }
    )
    return data.swapEvents.items
}

export async function fetchV3PricesSince(
    client: PonderClient,
    {
        tokenAddr,
        chainId,
        since,
        poolAddress,
    }: { tokenAddr: string; chainId: number; since: number; poolAddress?: string }
): Promise<V3PricePoint[]> {
    const data = await client.request<{ v3SwapEvents: Items<V3PricePoint> }>(
        `query V3PricesSince($where: v3SwapEventFilter) {
            v3SwapEvents(
                where: $where orderBy: "timestamp" orderDirection: "asc" limit: ${MAX_LIMIT}
            ) {
                items { ${sel(V3_PRICE_POINT_FIELDS)} }
            }
        }`,
        { where: { ...v3SwapWhere(tokenAddr, chainId, poolAddress), timestamp_gte: since } }
    )
    return data.v3SwapEvents.items
}

export type PoolPriceHistory = { anchor: PoolPricePoint | null; events: PoolPricePoint[] }

export async function fetchPoolPriceHistory(
    client: PonderClient,
    { poolAddress, chainId, since }: { poolAddress: string; chainId: number; since: number }
): Promise<PoolPriceHistory> {
    const [anchor, events] = await Promise.all([
        client
            .request<{ v3SwapEvents: Items<PoolPricePoint> }>(
                `query PoolPriceAnchor($where: v3SwapEventFilter) {
                v3SwapEvents(where: $where orderBy: "timestamp" orderDirection: "desc" limit: 1) {
                    items { ${sel(POOL_POINT_FIELDS)} }
                }
            }`,
                { where: { poolAddress, chainId, timestamp_lte: since } }
            )
            .catch(() => null),
        client.fetchAllPages<{ v3SwapEvents: Page<PoolPricePoint> }, PoolPricePoint>(
            `query PoolPriceHistory($where: v3SwapEventFilter, $after: String) {
                v3SwapEvents(
                    where: $where orderBy: "timestamp" orderDirection: "asc"
                    limit: ${MAX_LIMIT} after: $after
                ) {
                    pageInfo { hasNextPage endCursor }
                    items { ${sel(POOL_POINT_FIELDS)} }
                }
            }`,
            { where: { poolAddress, chainId, timestamp_gt: since } },
            (r) => r.v3SwapEvents
        ),
    ])
    return { anchor: anchor?.v3SwapEvents.items[0] ?? null, events }
}

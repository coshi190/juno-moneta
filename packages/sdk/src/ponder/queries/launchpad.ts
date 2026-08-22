import type { PonderClient } from '../client.js'
import type { LaunchToken, TokenSnapshot, SwapEvent, TokenHolder } from '../entities.js'
import { sel, MAX_LIMIT, type Items, type Page, type Row, type OrderDirection } from './internal.js'

export const LAUNCH_TOKEN_DETAIL_FIELDS = [
    'tokenAddr',
    'creator',
    'name',
    'symbol',
    'logo',
    'description',
    'link1',
    'link2',
    'link3',
    'createdTime',
    'isGraduated',
    'graduatedAt',
] as const satisfies readonly (keyof LaunchToken)[]

export const LAUNCH_TOKEN_META_FIELDS = [
    'tokenAddr',
    'name',
    'symbol',
    'logo',
] as const satisfies readonly (keyof LaunchToken)[]

export const LAUNCH_TOKEN_CARD_FIELDS = [
    'tokenAddr',
    'name',
    'symbol',
    'logo',
    'isGraduated',
] as const satisfies readonly (keyof LaunchToken)[]

export const TOKEN_SNAPSHOT_LIST_FIELDS = [
    'tokenAddr',
    'lastSwapAt',
    'marketCapNative',
    'athMarketCapNative',
    'lastPrice',
    'price1dAgoTimestamp',
    'priceChange1dPct',
] as const satisfies readonly (keyof TokenSnapshot)[]

export const TOKEN_SNAPSHOT_CREATOR_FIELDS = [
    'tokenAddr',
    'marketCapNative',
    'creatorFeeNative',
    'creatorFeeClaimedNative',
    'creatorFeeToken',
    'creatorFeeClaimedToken',
    'lastPriceUsd',
] as const satisfies readonly (keyof TokenSnapshot)[]

export const TOKEN_SNAPSHOT_HOLDER_COUNT_FIELDS = [
    'holderCount',
] as const satisfies readonly (keyof TokenSnapshot)[]

export type LaunchTokenDetail = Row<LaunchToken, typeof LAUNCH_TOKEN_DETAIL_FIELDS>
export type LaunchTokenMeta = Row<LaunchToken, typeof LAUNCH_TOKEN_META_FIELDS>
export type LaunchTokenCard = Row<LaunchToken, typeof LAUNCH_TOKEN_CARD_FIELDS>
export type LaunchTokenListSnapshot = Row<TokenSnapshot, typeof TOKEN_SNAPSHOT_LIST_FIELDS>
export type CreatorTokenSnapshot = Row<TokenSnapshot, typeof TOKEN_SNAPSHOT_CREATOR_FIELDS>

export interface LaunchTokenFilter {
    chainId?: number
    creator?: string
    isGraduated?: 0 | 1
    tokenAddrs?: string[]
}

export interface TokenSnapshotFilter {
    chainId?: number
    tokenAddrs?: string[]
}

export interface QueryOrder<TEntity> {
    orderBy: keyof TEntity
    orderDirection?: OrderDirection
}

function launchTokenWhere(filter: LaunchTokenFilter) {
    const where: Record<string, unknown> = {}
    if (filter.chainId !== undefined) where.chainId = filter.chainId
    if (filter.creator) where.creator = filter.creator.toLowerCase()
    if (filter.isGraduated !== undefined) where.isGraduated = filter.isGraduated
    if (filter.tokenAddrs) where.tokenAddr_in = filter.tokenAddrs.map((a) => a.toLowerCase())
    return where
}

function tokenSnapshotWhere(filter: TokenSnapshotFilter) {
    const where: Record<string, unknown> = {}
    if (filter.chainId !== undefined) where.chainId = filter.chainId
    if (filter.tokenAddrs) where.tokenAddr_in = filter.tokenAddrs.map((a) => a.toLowerCase())
    return where
}

function orderArgs<TEntity>(order: QueryOrder<TEntity> | undefined) {
    if (!order) return ''
    return `orderBy: "${String(order.orderBy)}" orderDirection: "${order.orderDirection ?? 'asc'}"`
}

export function fetchLaunchTokens<F extends readonly (keyof LaunchToken)[]>(
    client: PonderClient,
    filter: LaunchTokenFilter,
    fields: F,
    order?: QueryOrder<LaunchToken>
): Promise<Row<LaunchToken, F>[]> {
    if (filter.tokenAddrs && filter.tokenAddrs.length === 0) return Promise.resolve([])
    return client.fetchAllPages<{ launchTokens: Page<Row<LaunchToken, F>> }, Row<LaunchToken, F>>(
        `query LaunchTokens($where: launchTokenFilter, $after: String) {
            launchTokens(
                where: $where
                ${orderArgs(order)}
                limit: ${MAX_LIMIT}
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(fields)} }
            }
        }`,
        { where: launchTokenWhere(filter) },
        (r) => r.launchTokens
    )
}

export function fetchTokenSnapshots<F extends readonly (keyof TokenSnapshot)[]>(
    client: PonderClient,
    filter: TokenSnapshotFilter,
    fields: F,
    order?: QueryOrder<TokenSnapshot>
): Promise<Row<TokenSnapshot, F>[]> {
    if (filter.tokenAddrs && filter.tokenAddrs.length === 0) return Promise.resolve([])
    return client.fetchAllPages<
        { tokenSnapshots: Page<Row<TokenSnapshot, F>> },
        Row<TokenSnapshot, F>
    >(
        `query TokenSnapshots($where: tokenSnapshotFilter, $after: String) {
            tokenSnapshots(
                where: $where
                ${orderArgs(order)}
                limit: ${MAX_LIMIT}
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(fields)} }
            }
        }`,
        { where: tokenSnapshotWhere(filter) },
        (r) => r.tokenSnapshots
    )
}

const RECENT_SWAP_FIELDS = [
    'tokenAddr',
    'sender',
    'isBuy',
    'amountIn',
    'amountOut',
    'reserveIn',
    'reserveOut',
    'timestamp',
    'transactionHash',
] as const satisfies readonly (keyof SwapEvent)[]

export type RecentSwap = Row<SwapEvent, typeof RECENT_SWAP_FIELDS>

export async function fetchRecentSwaps(
    client: PonderClient,
    { chainId, limit = 50 }: { chainId: number; limit?: number }
): Promise<{ swaps: RecentSwap[]; tokens: LaunchTokenMeta[] }> {
    const data = await client.request<{
        swapEvents: Items<RecentSwap>
        launchTokens: Items<LaunchTokenMeta>
    }>(
        `query RecentSwaps($chainId: Int!, $limit: Int!) {
            swapEvents(
                where: { chainId: $chainId }
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
            ) { items { ${sel(RECENT_SWAP_FIELDS)} } }
            launchTokens(where: { chainId: $chainId }, limit: ${MAX_LIMIT}) {
                items { ${sel(LAUNCH_TOKEN_META_FIELDS)} }
            }
        }`,
        { chainId, limit }
    )
    return { swaps: data.swapEvents.items, tokens: data.launchTokens.items }
}

export const TOKEN_HOLDER_ADDRESS_FIELDS = [
    'address',
] as const satisfies readonly (keyof TokenHolder)[]

export const TOKEN_HOLDER_BALANCE_FIELDS = [
    'tokenAddr',
    'balance',
] as const satisfies readonly (keyof TokenHolder)[]

export interface TokenHolderFilter {
    chainId?: number
    tokenAddr?: string
    address?: string
}

function tokenHolderWhere(filter: TokenHolderFilter) {
    const where: Record<string, unknown> = {}
    if (filter.chainId !== undefined) where.chainId = filter.chainId
    if (filter.tokenAddr) where.tokenAddr = filter.tokenAddr.toLowerCase()
    if (filter.address) where.address = filter.address.toLowerCase()
    return where
}

export function fetchTokenHolders<F extends readonly (keyof TokenHolder)[]>(
    client: PonderClient,
    filter: TokenHolderFilter,
    fields: F,
    order?: QueryOrder<TokenHolder>
): Promise<Row<TokenHolder, F>[]> {
    return client.fetchAllPages<{ tokenHolders: Page<Row<TokenHolder, F>> }, Row<TokenHolder, F>>(
        `query TokenHolders($where: tokenHolderFilter, $after: String) {
            tokenHolders(
                where: $where
                ${orderArgs(order)}
                limit: ${MAX_LIMIT}
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(fields)} }
            }
        }`,
        { where: tokenHolderWhere(filter) },
        (r) => r.tokenHolders
    )
}

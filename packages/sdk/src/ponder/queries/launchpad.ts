import type { PonderClient } from '../client.js'
import type { LaunchToken, TokenSnapshot, NativeUsdPrice, SwapEvent } from '../entities.js'
import { sel, type Items, type Row } from './internal.js'

const DETAIL_FIELDS = [
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

const META_FIELDS = [
    'tokenAddr',
    'name',
    'symbol',
    'logo',
] as const satisfies readonly (keyof LaunchToken)[]

const LIST_SNAPSHOT_FIELDS = [
    'tokenAddr',
    'lastSwapAt',
    'marketCapNative',
    'athMarketCapNative',
    'lastPrice',
    'price1dAgoTimestamp',
    'priceChange1dPct',
] as const satisfies readonly (keyof TokenSnapshot)[]

const CREATOR_SNAPSHOT_FIELDS = [
    'tokenAddr',
    'marketCapNative',
    'creatorFeeNative',
    'creatorFeeClaimedNative',
    'creatorFeeToken',
    'creatorFeeClaimedToken',
    'lastPriceUsd',
] as const satisfies readonly (keyof TokenSnapshot)[]

const OG_TOKEN_FIELDS = [
    'tokenAddr',
    'chainId',
    'name',
    'symbol',
    'logo',
    'description',
    'isGraduated',
] as const satisfies readonly (keyof LaunchToken)[]

const OG_SNAPSHOT_FIELDS = [
    'tokenAddr',
    'marketCapNative',
    'priceChange1dPct',
] as const satisfies readonly (keyof TokenSnapshot)[]

export type LaunchTokenDetail = Row<LaunchToken, typeof DETAIL_FIELDS>
export type LaunchTokenMeta = Row<LaunchToken, typeof META_FIELDS>
export type LaunchTokenListSnapshot = Row<TokenSnapshot, typeof LIST_SNAPSHOT_FIELDS>
export type CreatorTokenSnapshot = Row<TokenSnapshot, typeof CREATOR_SNAPSHOT_FIELDS>

export async function fetchTokenList(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<{ tokens: LaunchTokenDetail[]; snapshots: LaunchTokenListSnapshot[] }> {
    const data = await client.request<{
        launchTokens: Items<LaunchTokenDetail>
        tokenSnapshots: Items<LaunchTokenListSnapshot>
    }>(
        `query TokenList($chainId: Int!) {
            launchTokens(
                where: { chainId: $chainId }
                orderBy: "createdTime"
                orderDirection: "desc"
            ) { items { ${sel(DETAIL_FIELDS)} } }
            tokenSnapshots(where: { chainId: $chainId }) {
                items { ${sel(LIST_SNAPSHOT_FIELDS)} }
            }
        }`,
        { chainId }
    )
    return { tokens: data.launchTokens.items, snapshots: data.tokenSnapshots.items }
}

export async function fetchCreatedTokens(
    client: PonderClient,
    { chainId, creator, limit = 200 }: { chainId: number; creator: string; limit?: number }
): Promise<LaunchTokenDetail[]> {
    const data = await client.request<{ launchTokens: Items<LaunchTokenDetail> }>(
        `query CreatedTokens($chainId: Int!, $creator: String!, $limit: Int!) {
            launchTokens(
                where: { chainId: $chainId, creator: $creator }
                orderBy: "createdTime"
                orderDirection: "desc"
                limit: $limit
            ) { items { ${sel(DETAIL_FIELDS)} } }
        }`,
        { chainId, creator, limit }
    )
    return data.launchTokens.items
}

export async function fetchCreatorSnapshots(
    client: PonderClient,
    { chainId, tokenAddrs, limit = 200 }: { chainId: number; tokenAddrs: string[]; limit?: number }
): Promise<CreatorTokenSnapshot[]> {
    if (tokenAddrs.length === 0) return []
    const data = await client.request<{ tokenSnapshots: Items<CreatorTokenSnapshot> }>(
        `query CreatorSnapshots($chainId: Int!, $tokenAddrs: [String!], $limit: Int!) {
            tokenSnapshots(
                where: { chainId: $chainId, tokenAddr_in: $tokenAddrs }
                limit: $limit
            ) { items { ${sel(CREATOR_SNAPSHOT_FIELDS)} } }
        }`,
        { chainId, tokenAddrs, limit }
    )
    return data.tokenSnapshots.items
}

export async function fetchGraduatedTokens(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<LaunchTokenMeta[]> {
    const data = await client.request<{ launchTokens: Items<LaunchTokenMeta> }>(
        `query GraduatedTokens($chainId: Int!) {
            launchTokens(
                where: { chainId: $chainId, isGraduated: 1 }
                orderBy: "graduatedAt"
                orderDirection: "desc"
                limit: 1000
            ) { items { ${sel(META_FIELDS)} } }
        }`,
        { chainId }
    )
    return data.launchTokens.items
}

export async function fetchBondingCurveTokens(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<LaunchTokenMeta[]> {
    const data = await client.request<{ launchTokens: Items<LaunchTokenMeta> }>(
        `query BondingCurveTokens($chainId: Int!) {
            launchTokens(where: { chainId: $chainId, isGraduated: 0 }, limit: 1000) {
                items { ${sel(META_FIELDS)} }
            }
        }`,
        { chainId }
    )
    return data.launchTokens.items
}

export async function fetchLaunchTokenMeta(
    client: PonderClient,
    { chainId }: { chainId: number }
): Promise<LaunchTokenMeta[]> {
    const data = await client.request<{ launchTokens: Items<LaunchTokenMeta> }>(
        `query LaunchTokenMeta($chainId: Int!) {
            launchTokens(where: { chainId: $chainId }, limit: 1000) {
                items { ${sel(META_FIELDS)} }
            }
        }`,
        { chainId }
    )
    return data.launchTokens.items
}

export async function fetchLaunchTokensByAddresses(
    client: PonderClient,
    { tokenAddrs, limit = 100 }: { tokenAddrs: string[]; limit?: number }
): Promise<Array<LaunchTokenMeta & Pick<LaunchToken, 'isGraduated'>>> {
    if (tokenAddrs.length === 0) return []
    const fields = [...META_FIELDS, 'isGraduated'] as const satisfies readonly (keyof LaunchToken)[]
    const data = await client.request<{
        launchTokens: Items<Row<LaunchToken, typeof fields>>
    }>(
        `query LaunchTokensByAddresses($tokenAddrs: [String!], $limit: Int!) {
            launchTokens(where: { tokenAddr_in: $tokenAddrs }, limit: $limit) {
                items { ${sel(fields)} }
            }
        }`,
        { tokenAddrs, limit }
    )
    return data.launchTokens.items
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
            launchTokens(where: { chainId: $chainId }, limit: 1000) {
                items { ${sel(META_FIELDS)} }
            }
        }`,
        { chainId, limit }
    )
    return { swaps: data.swapEvents.items, tokens: data.launchTokens.items }
}

export interface LaunchTokenOg {
    token: Row<LaunchToken, typeof OG_TOKEN_FIELDS> | null
    snapshot: Row<TokenSnapshot, typeof OG_SNAPSHOT_FIELDS> | null
    nativeUsdPrice: Pick<NativeUsdPrice, 'chainId' | 'price'> | null
}

export async function fetchLaunchTokenOg(
    client: PonderClient,
    { tokenAddr }: { tokenAddr: string }
): Promise<LaunchTokenOg> {
    const data = await client.request<{
        launchTokens: Items<Row<LaunchToken, typeof OG_TOKEN_FIELDS>>
        tokenSnapshots: Items<Row<TokenSnapshot, typeof OG_SNAPSHOT_FIELDS>>
        nativeUsdPrices: Items<Pick<NativeUsdPrice, 'chainId' | 'price'>>
    }>(
        `query LaunchTokenOg($tokenAddr: String!) {
            launchTokens(where: { tokenAddr: $tokenAddr }, limit: 1) {
                items { ${sel(OG_TOKEN_FIELDS)} }
            }
            tokenSnapshots(where: { tokenAddr: $tokenAddr }, limit: 1) {
                items { ${sel(OG_SNAPSHOT_FIELDS)} }
            }
            nativeUsdPrices(limit: 100) { items { chainId price } }
        }`,
        { tokenAddr }
    )
    const token = data.launchTokens.items[0] ?? null
    const nativeUsdPrice =
        (token && data.nativeUsdPrices.items.find((p) => p.chainId === token.chainId)) || null
    return {
        token,
        snapshot: data.tokenSnapshots.items[0] ?? null,
        nativeUsdPrice,
    }
}

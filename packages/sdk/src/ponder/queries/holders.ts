import type { PonderClient } from '../client.js'
import type { TokenHolder, TokenSnapshot } from '../entities.js'
import { sel, type Items, type Row } from './internal.js'

const BALANCE_FIELDS = ['tokenAddr', 'balance'] as const satisfies readonly (keyof TokenHolder)[]

const LEADERBOARD_FIELDS = [
    'address',
    'tokenAddr',
    'balance',
] as const satisfies readonly (keyof TokenHolder)[]

export type HolderBalance = Row<TokenHolder, typeof BALANCE_FIELDS>
export type LeaderboardHolder = Row<TokenHolder, typeof LEADERBOARD_FIELDS>

export async function fetchTokenHolders(
    client: PonderClient,
    { tokenAddr, limit = 200 }: { tokenAddr: string; limit?: number }
): Promise<{ addresses: string[]; holderCount: number | null }> {
    const data = await client.request<{
        tokenHolders: Items<Pick<TokenHolder, 'address'>>
        tokenSnapshots: Items<Pick<TokenSnapshot, 'holderCount'>>
    }>(
        `query TokenHolders($tokenAddr: String!, $limit: Int!) {
            tokenHolders(where: { tokenAddr: $tokenAddr }, limit: $limit) {
                items { address }
            }
            tokenSnapshots(where: { tokenAddr: $tokenAddr }, limit: 1) {
                items { holderCount }
            }
        }`,
        { tokenAddr, limit }
    )
    return {
        addresses: data.tokenHolders.items.map((h) => h.address),
        holderCount: data.tokenSnapshots.items[0]?.holderCount ?? null,
    }
}

export async function fetchHolderBalances(
    client: PonderClient,
    { address, limit = 100 }: { address: string; limit?: number }
): Promise<HolderBalance[]> {
    const data = await client.request<{ tokenHolders: Items<HolderBalance> }>(
        `query HolderBalances($address: String!, $limit: Int!) {
            tokenHolders(where: { address: $address }, limit: $limit) {
                items { ${sel(BALANCE_FIELDS)} }
            }
        }`,
        { address, limit }
    )
    return data.tokenHolders.items
}

export async function fetchAllTokenHolders(
    client: PonderClient,
    { limit = 5000 }: { limit?: number } = {}
): Promise<LeaderboardHolder[]> {
    const data = await client.request<{ tokenHolders: Items<LeaderboardHolder> }>(
        `query AllTokenHolders($limit: Int!) {
            tokenHolders(limit: $limit) { items { ${sel(LEADERBOARD_FIELDS)} } }
        }`,
        { limit }
    )
    return data.tokenHolders.items
}

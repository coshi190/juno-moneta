import type { PonderClient } from '../client.js'
import type { V3Position } from '../entities.js'
import { sel, type Items, type Row } from './internal.js'

const POSITION_FIELDS = [
    'tokenId',
    'owner',
    'token0',
    'token1',
    'fee',
    'tickLower',
    'tickUpper',
    'liquidity',
    'tokensOwed0',
    'tokensOwed1',
] as const satisfies readonly (keyof V3Position)[]

export type V3PositionRow = Row<V3Position, typeof POSITION_FIELDS>

export async function fetchUserPositions(
    client: PonderClient,
    { chainId, owner, limit = 500 }: { chainId: number; owner: string; limit?: number }
): Promise<V3PositionRow[]> {
    const data = await client.request<{ v3Positions: Items<V3PositionRow> }>(
        `query UserPositions($chainId: Int!, $owner: String!, $limit: Int!) {
            v3Positions(where: { chainId: $chainId, owner: $owner }, limit: $limit) {
                items { ${sel(POSITION_FIELDS)} }
            }
        }`,
        { chainId, owner: owner.toLowerCase(), limit }
    )
    return data.v3Positions.items
}

export async function fetchPositionsByTokenIds(
    client: PonderClient,
    { chainId, tokenIds, limit = 500 }: { chainId: number; tokenIds: bigint[]; limit?: number }
): Promise<V3PositionRow[]> {
    if (tokenIds.length === 0) return []
    const ids = tokenIds.map((id) => `${chainId}-${id}`)
    const data = await client.request<{ v3Positions: Items<V3PositionRow> }>(
        `query PositionsByIds($ids: [String!], $limit: Int!) {
            v3Positions(where: { id_in: $ids }, limit: $limit) {
                items { ${sel(POSITION_FIELDS)} }
            }
        }`,
        { ids, limit }
    )
    return data.v3Positions.items
}

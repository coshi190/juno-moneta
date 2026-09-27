import type { PonderClient } from '../client.js'
import type { LaunchToken, TokenSnapshot, TokenHolder } from '../entities.js'
import { fetchAllRows, type Row, type OrderDirection } from './internal.js'

export interface TokenSnapshotFilter {
    chainId?: number
    launchpadId?: string
    tokenAddrs?: string[]
}

export interface LaunchTokenFilter extends TokenSnapshotFilter {
    creator?: string
    isGraduated?: 0 | 1
}

export interface TokenHolderFilter {
    chainId?: number
    tokenAddr?: string
    address?: string
}

export interface QueryOrder<TEntity> {
    orderBy: keyof TEntity
    orderDirection?: OrderDirection
}

const lower = (a?: string) => (a ? a.toLowerCase() : undefined)

function fetchAll<T, F extends readonly (keyof T)[]>(
    client: PonderClient,
    entity: string,
    {
        tokenAddrs,
        creator,
        tokenAddr,
        address,
        launchpadId,
        ...rest
    }: LaunchTokenFilter & TokenHolderFilter,
    fields: F,
    order?: QueryOrder<T>
): Promise<Row<T, F>[]> {
    if (tokenAddrs?.length === 0) return Promise.resolve([])
    const orderArgs = order
        ? `orderBy: "${String(order.orderBy)}" orderDirection: "${order.orderDirection ?? 'asc'}"`
        : ''
    const where = {
        ...rest,
        launchpadId: launchpadId || undefined,
        creator: lower(creator),
        tokenAddr: lower(tokenAddr),
        address: lower(address),
        tokenAddr_in: tokenAddrs?.map((a) => a.toLowerCase()),
    }
    return fetchAllRows(client, entity, where, fields, orderArgs)
}

export const fetchLaunchTokens = <F extends readonly (keyof LaunchToken)[]>(
    client: PonderClient,
    filter: LaunchTokenFilter,
    fields: F,
    order?: QueryOrder<LaunchToken>
) => fetchAll(client, 'launchToken', filter, fields, order)

export const fetchTokenSnapshots = <F extends readonly (keyof TokenSnapshot)[]>(
    client: PonderClient,
    filter: TokenSnapshotFilter,
    fields: F,
    order?: QueryOrder<TokenSnapshot>
) => fetchAll(client, 'tokenSnapshot', filter, fields, order)

export const fetchTokenHolders = <F extends readonly (keyof TokenHolder)[]>(
    client: PonderClient,
    filter: TokenHolderFilter,
    fields: F,
    order?: QueryOrder<TokenHolder>
) => fetchAll(client, 'tokenHolder', filter, fields, order)

import type { PonderClient, PonderPageInfo } from '../client.js'

export type Row<T, F extends readonly (keyof T)[]> = Pick<T, F[number]>

export type Items<T> = { items: T[] }
export type Page<T> = Items<T> & { pageInfo: PonderPageInfo }
export type CountedItems<T> = Items<T> & { totalCount: number }

export type OrderDirection = 'asc' | 'desc'

export const MAX_LIMIT = 1000

export const sel = (fields: readonly PropertyKey[]): string => fields.join(' ')

export function fetchAllRows<R>(
    client: PonderClient,
    entity: string,
    where: Record<string, unknown>,
    fields: readonly PropertyKey[],
    order = ''
): Promise<R[]> {
    return client.fetchAllPages<Record<string, Page<R>>, R>(
        `query ($where: ${entity}Filter, $after: String) {
            ${entity}s(where: $where ${order} limit: ${MAX_LIMIT} after: $after) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(fields)} }
            }
        }`,
        { where },
        (r) => r[`${entity}s`]!
    )
}

export const v3SwapWhere = (
    tokenAddr: string,
    chainId: number,
    poolAddress?: string
): Record<string, unknown> => ({
    tokenAddr,
    chainId,
    ...(poolAddress && { poolAddress: poolAddress.toLowerCase() }),
})

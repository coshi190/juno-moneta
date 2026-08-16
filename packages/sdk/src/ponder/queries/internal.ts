import type { PonderPageInfo } from '../client.js'

export type Row<TEntity, TFields extends readonly (keyof TEntity)[]> = Pick<
    TEntity,
    TFields[number]
>

export interface Items<T> {
    items: T[]
}

export interface Page<T> extends Items<T> {
    pageInfo: PonderPageInfo
}

export interface CountedItems<T> extends Items<T> {
    totalCount: number
}

export const sel = (fields: readonly PropertyKey[]): string => fields.join(' ')

export type OrderDirection = 'asc' | 'desc'

export const MAX_LIMIT = 1000

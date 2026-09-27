import type { PonderClient } from '../client.js'
import type {
    AggSwapEvent,
    SwapEvent,
    TransferEvent,
    V2SwapEvent,
    V3SwapEvent,
} from '../entities.js'
import {
    sel,
    v3SwapWhere,
    MAX_LIMIT,
    type CountedItems,
    type Items,
    type OrderDirection,
    type Page,
    type Row,
} from './internal.js'

const BC_ACTIVITY_FIELDS = [
    'id',
    'tokenAddr',
    'sender',
    'isBuy',
    'amountIn',
    'amountOut',
    'timestamp',
    'transactionHash',
] as const satisfies readonly (keyof SwapEvent)[]

const V3_ACTIVITY_FIELDS = [
    'id',
    'tokenAddr',
    'sender',
    'txFrom',
    'tokenIsToken0',
    'amount0',
    'amount1',
    'timestamp',
    'transactionHash',
    'protocol',
] as const satisfies readonly (keyof V3SwapEvent)[]

const V2_ACTIVITY_FIELDS = [
    'id',
    'txFrom',
    'token0Addr',
    'token1Addr',
    'amount0In',
    'amount1In',
    'amount0Out',
    'amount1Out',
    'timestamp',
    'transactionHash',
    'protocol',
] as const satisfies readonly (keyof V2SwapEvent)[]

const AGG_ACTIVITY_FIELDS = [
    'id',
    'sender',
    'tokenIn',
    'tokenOut',
    'amountIn',
    'amountOut',
    'fee',
    'legs',
    'timestamp',
    'transactionHash',
] as const satisfies readonly (keyof AggSwapEvent)[]

const TRANSFER_FIELDS = [
    'id',
    'tokenAddr',
    'from',
    'to',
    'amount',
    'timestamp',
    'transactionHash',
] as const satisfies readonly (keyof TransferEvent)[]

const BC_SWAP_FIELDS = [
    'tokenAddr',
    'sender',
    'isBuy',
    'amountIn',
    'amountOut',
    'reserveIn',
    'reserveOut',
    'priceNative',
    'preSwapPriceNative',
    'timestamp',
    'transactionHash',
    'blockNumber',
] as const satisfies readonly (keyof SwapEvent)[]

const V3_SWAP_FIELDS = [
    'txFrom',
    'tokenIsToken0',
    'amount0',
    'amount1',
    'sqrtPriceX96',
    'tick',
    'timestamp',
    'transactionHash',
    'blockNumber',
] as const satisfies readonly (keyof V3SwapEvent)[]

export type BondingCurveActivity = Row<SwapEvent, typeof BC_ACTIVITY_FIELDS>
export type V3Activity = Row<V3SwapEvent, typeof V3_ACTIVITY_FIELDS>
export type V2Activity = Row<V2SwapEvent, typeof V2_ACTIVITY_FIELDS>
export type AggActivity = Row<AggSwapEvent, typeof AGG_ACTIVITY_FIELDS>
export type TransferActivity = Row<TransferEvent, typeof TRANSFER_FIELDS>
export type BondingCurveSwap = Row<SwapEvent, typeof BC_SWAP_FIELDS>
export type V3Swap = Row<V3SwapEvent, typeof V3_SWAP_FIELDS>

type EventTable =
    'swapEvents' | 'v3SwapEvents' | 'v2SwapEvents' | 'aggSwapEvents' | 'transferEvents'

const filterType = (table: EventTable) => `${table.slice(0, -1)}Filter`

export interface ActivityArgs {
    chainId: number
    sender: string
    limit: number
    after?: string | null
}

async function fetchUserActivity<T>(
    client: PonderClient,
    table: EventTable,
    fields: readonly PropertyKey[],
    where: Record<string, unknown>,
    { limit, after = null }: { limit: number; after?: string | null }
): Promise<T[]> {
    const data = await client.request<Record<typeof table, Items<T>>>(
        `query UserActivity($where: ${filterType(table)}, $limit: Int!, $after: String) {
            ${table}(
                where: $where orderBy: "timestamp" orderDirection: "desc"
                limit: $limit after: $after
            ) {
                items { ${sel(fields)} }
            }
        }`,
        { where, limit, after }
    )
    return data[table].items
}

export function fetchUserBondingCurveSwaps(
    client: PonderClient,
    { chainId, sender, ...page }: ActivityArgs
): Promise<BondingCurveActivity[]> {
    const where = { sender, chainId }
    return fetchUserActivity(client, 'swapEvents', BC_ACTIVITY_FIELDS, where, page)
}

export function fetchUserV3Swaps(
    client: PonderClient,
    { chainId, sender, ...page }: ActivityArgs
): Promise<V3Activity[]> {
    const where = { txFrom: sender, chainId }
    return fetchUserActivity(client, 'v3SwapEvents', V3_ACTIVITY_FIELDS, where, page)
}

export function fetchUserV2Swaps(
    client: PonderClient,
    { chainId, sender, ...page }: ActivityArgs
): Promise<V2Activity[]> {
    const where = { txFrom: sender, chainId }
    return fetchUserActivity(client, 'v2SwapEvents', V2_ACTIVITY_FIELDS, where, page)
}

export function fetchUserAggSwaps(
    client: PonderClient,
    { chainId, sender, ...page }: ActivityArgs
): Promise<AggActivity[]> {
    const where = { sender, chainId }
    return fetchUserActivity(client, 'aggSwapEvents', AGG_ACTIVITY_FIELDS, where, page)
}

export function fetchUserTransfers(
    client: PonderClient,
    { chainId, sender, limit }: Omit<ActivityArgs, 'after'>
): Promise<TransferActivity[]> {
    const where = { AND: [{ OR: [{ from: sender }, { to: sender }] }, { chainId }] }
    return fetchUserActivity(client, 'transferEvents', TRANSFER_FIELDS, where, { limit })
}

export interface TokenSwapArgs {
    tokenAddr: string
    orderDirection?: OrderDirection
    page: { limit: number; offset: number } | 'all'
}

async function fetchTokenSwaps<T>(
    client: PonderClient,
    table: 'swapEvents' | 'v3SwapEvents',
    fields: readonly PropertyKey[],
    where: Record<string, unknown>,
    { orderDirection = 'desc', page }: Omit<TokenSwapArgs, 'tokenAddr'>
): Promise<CountedItems<T>> {
    if (orderDirection !== 'asc' && orderDirection !== 'desc') {
        throw new Error(`invalid orderDirection "${String(orderDirection)}"`)
    }
    const filter = filterType(table)
    const order = `orderBy: "timestamp" orderDirection: "${orderDirection}"`

    if (page !== 'all') {
        const data = await client.request<Record<typeof table, CountedItems<T>>>(
            `query TokenSwapPage($where: ${filter}, $limit: Int!, $offset: Int!) {
                ${table}(where: $where ${order} limit: $limit offset: $offset) {
                    items { ${sel(fields)} }
                    totalCount
                }
            }`,
            { where, ...page }
        )
        return data[table]
    }

    const items = await client.fetchAllPages<Record<typeof table, Page<T>>, T>(
        `query TokenSwaps($where: ${filter}, $after: String) {
            ${table}(where: $where ${order} limit: ${MAX_LIMIT} after: $after) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(fields)} }
            }
        }`,
        { where },
        (r) => r[table]
    )
    return { items, totalCount: items.length }
}

export async function fetchBondingCurveSwaps(
    client: PonderClient,
    {
        chainId,
        tokenAddr,
        isBuy,
        sender,
        ...opts
    }: Omit<TokenSwapArgs, 'tokenAddr'> & {
        chainId?: number
        tokenAddr?: string
        isBuy?: number
        sender?: string
    }
): Promise<CountedItems<BondingCurveSwap>> {
    if (!tokenAddr && chainId === undefined) {
        throw new Error('fetchBondingCurveSwaps requires tokenAddr or chainId')
    }
    const where: Record<string, unknown> = {}
    if (chainId !== undefined) where.chainId = chainId
    if (tokenAddr) where.tokenAddr = tokenAddr
    if (isBuy !== undefined) where.isBuy = isBuy
    if (sender) where.sender = sender
    return fetchTokenSwaps(client, 'swapEvents', BC_SWAP_FIELDS, where, opts)
}

export function fetchTokenV3Swaps(
    client: PonderClient,
    {
        tokenAddr,
        chainId,
        txFrom,
        poolAddress,
        ...opts
    }: TokenSwapArgs & { chainId: number; txFrom?: string; poolAddress?: string }
): Promise<CountedItems<V3Swap>> {
    const where = v3SwapWhere(tokenAddr, chainId, poolAddress)
    if (txFrom) where.txFrom = txFrom
    return fetchTokenSwaps(client, 'v3SwapEvents', V3_SWAP_FIELDS, where, opts)
}

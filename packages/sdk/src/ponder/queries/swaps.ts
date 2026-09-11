import type { PonderClient } from '../client.js'
import type {
    AggSwapEvent,
    SwapEvent,
    TransferEvent,
    V2SwapEvent,
    V3SwapEvent,
} from '../entities.js'
import { sel, type CountedItems, type Items, type Row } from './internal.js'

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

const BC_DETAIL_FIELDS = [
    'sender',
    'isBuy',
    'amountIn',
    'amountOut',
    'reserveIn',
    'reserveOut',
    'timestamp',
    'transactionHash',
    'blockNumber',
] as const satisfies readonly (keyof SwapEvent)[]

const V3_DETAIL_FIELDS = [
    'txFrom',
    'tokenIsToken0',
    'amount0',
    'amount1',
    'sqrtPriceX96',
    'timestamp',
    'transactionHash',
    'blockNumber',
] as const satisfies readonly (keyof V3SwapEvent)[]

export type BondingCurveActivity = Row<SwapEvent, typeof BC_ACTIVITY_FIELDS>
export type V3Activity = Row<V3SwapEvent, typeof V3_ACTIVITY_FIELDS>
export type V2Activity = Row<V2SwapEvent, typeof V2_ACTIVITY_FIELDS>
export type AggActivity = Row<AggSwapEvent, typeof AGG_ACTIVITY_FIELDS>
export type TransferActivity = Row<TransferEvent, typeof TRANSFER_FIELDS>
export type BondingCurveSwapDetail = Row<SwapEvent, typeof BC_DETAIL_FIELDS>
export type V3SwapDetail = Row<V3SwapEvent, typeof V3_DETAIL_FIELDS>

export interface ActivityArgs {
    chainId: number
    sender: string
    limit: number
    after?: string | null
}

export async function fetchUserBondingCurveSwaps(
    client: PonderClient,
    { chainId, sender, limit, after = null }: ActivityArgs
): Promise<BondingCurveActivity[]> {
    const data = await client.request<{ swapEvents: Items<BondingCurveActivity> }>(
        `query UserBondingCurveSwaps($sender: String!, $chainId: Int!, $limit: Int!, $after: String) {
            swapEvents(
                where: { sender: $sender, chainId: $chainId }
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
                after: $after
            ) { items { ${sel(BC_ACTIVITY_FIELDS)} } }
        }`,
        { sender, chainId, limit, after }
    )
    return data.swapEvents.items
}

export async function fetchUserV3Swaps(
    client: PonderClient,
    { chainId, sender, limit, after = null }: ActivityArgs
): Promise<V3Activity[]> {
    const data = await client.request<{ v3SwapEvents: Items<V3Activity> }>(
        `query UserV3Swaps($sender: String!, $chainId: Int!, $limit: Int!, $after: String) {
            v3SwapEvents(
                where: { txFrom: $sender, chainId: $chainId }
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
                after: $after
            ) { items { ${sel(V3_ACTIVITY_FIELDS)} } }
        }`,
        { sender, chainId, limit, after }
    )
    return data.v3SwapEvents.items
}

export async function fetchUserV2Swaps(
    client: PonderClient,
    { chainId, sender, limit, after = null }: ActivityArgs
): Promise<V2Activity[]> {
    const data = await client.request<{ v2SwapEvents: Items<V2Activity> }>(
        `query UserV2Swaps($sender: String!, $chainId: Int!, $limit: Int!, $after: String) {
            v2SwapEvents(
                where: { txFrom: $sender, chainId: $chainId }
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
                after: $after
            ) { items { ${sel(V2_ACTIVITY_FIELDS)} } }
        }`,
        { sender, chainId, limit, after }
    )
    return data.v2SwapEvents.items
}

export async function fetchUserAggSwaps(
    client: PonderClient,
    { chainId, sender, limit, after = null }: ActivityArgs
): Promise<AggActivity[]> {
    const data = await client.request<{ aggSwapEvents: Items<AggActivity> }>(
        `query UserAggSwaps($sender: String!, $chainId: Int!, $limit: Int!, $after: String) {
            aggSwapEvents(
                where: { sender: $sender, chainId: $chainId }
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
                after: $after
            ) { items { ${sel(AGG_ACTIVITY_FIELDS)} } }
        }`,
        { sender, chainId, limit, after }
    )
    return data.aggSwapEvents.items
}

export async function fetchUserTransfers(
    client: PonderClient,
    { chainId, sender, limit }: Omit<ActivityArgs, 'after'>
): Promise<TransferActivity[]> {
    const data = await client.request<{ transferEvents: Items<TransferActivity> }>(
        `query UserTransfers($sender: String!, $chainId: Int!, $limit: Int!) {
            transferEvents(
                where: {
                    AND: [{ OR: [{ from: $sender }, { to: $sender }] }, { chainId: $chainId }]
                }
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
            ) { items { ${sel(TRANSFER_FIELDS)} } }
        }`,
        { sender, chainId, limit }
    )
    return data.transferEvents.items
}

export interface TokenSwapPageArgs {
    tokenAddr: string
    chainId: number
    limit: number
    offset: number
}

export async function fetchTokenBondingCurveSwaps(
    client: PonderClient,
    {
        tokenAddr,
        limit,
        offset,
        isBuy,
        sender,
    }: Omit<TokenSwapPageArgs, 'chainId'> & {
        isBuy?: number
        sender?: string
    }
): Promise<CountedItems<BondingCurveSwapDetail>> {
    const where: Record<string, unknown> = { tokenAddr }
    if (isBuy !== undefined) where.isBuy = isBuy
    if (sender) where.sender = sender

    const data = await client.request<{ swapEvents: CountedItems<BondingCurveSwapDetail> }>(
        `query TokenBondingCurveSwaps($where: swapEventFilter, $limit: Int!, $offset: Int!) {
            swapEvents(
                where: $where
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
                offset: $offset
            ) {
                items { ${sel(BC_DETAIL_FIELDS)} }
                totalCount
            }
        }`,
        { where, limit, offset }
    )
    return data.swapEvents
}

export async function fetchTokenV3Swaps(
    client: PonderClient,
    { tokenAddr, chainId, limit, offset, txFrom }: TokenSwapPageArgs & { txFrom?: string }
): Promise<CountedItems<V3SwapDetail>> {
    const where: Record<string, unknown> = { tokenAddr, chainId }
    if (txFrom) where.txFrom = txFrom

    const data = await client.request<{ v3SwapEvents: CountedItems<V3SwapDetail> }>(
        `query TokenV3Swaps($where: v3SwapEventFilter, $limit: Int!, $offset: Int!) {
            v3SwapEvents(
                where: $where
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: $limit
                offset: $offset
            ) {
                items { ${sel(V3_DETAIL_FIELDS)} }
                totalCount
            }
        }`,
        { where, limit, offset }
    )
    return data.v3SwapEvents
}

import { isPonderError, type PonderClient } from '../client.js'
import { WRAPPED_NATIVE_ADDRESSES } from '../../configs/chains.js'
import { isLaunchpadChain } from '../../configs/deployments.js'
import { parseV2Swap, parseV3Swap, type ParsedSwap } from '../parse-swaps.js'
import type {
    AggSwapEvent,
    SwapEvent,
    TransferEvent,
    V2SwapEvent,
    V3SwapEvent,
} from '../entities.js'
import { sel, type CountedItems, type Items, type Page, type Row } from './internal.js'

const BC_SWAP_FIELDS = [
    'tokenAddr',
    'sender',
    'isBuy',
    'amountIn',
    'amountOut',
    'timestamp',
] as const satisfies readonly (keyof SwapEvent)[]

const V3_SWAP_FIELDS = [
    'tokenAddr',
    'txFrom',
    'amount0',
    'amount1',
    'token0Addr',
    'token1Addr',
    'timestamp',
    'protocol',
] as const satisfies readonly (keyof V3SwapEvent)[]

const V2_SWAP_FIELDS = [
    'txFrom',
    'token0Addr',
    'token1Addr',
    'amount0In',
    'amount1In',
    'amount0Out',
    'amount1Out',
    'timestamp',
    'protocol',
] as const satisfies readonly (keyof V2SwapEvent)[]

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

export type BondingCurveSwap = Row<SwapEvent, typeof BC_SWAP_FIELDS>
export type V3Swap = Row<V3SwapEvent, typeof V3_SWAP_FIELDS>
export type V2Swap = Row<V2SwapEvent, typeof V2_SWAP_FIELDS>
export type BondingCurveActivity = Row<SwapEvent, typeof BC_ACTIVITY_FIELDS>
export type V3Activity = Row<V3SwapEvent, typeof V3_ACTIVITY_FIELDS>
export type V2Activity = Row<V2SwapEvent, typeof V2_ACTIVITY_FIELDS>
export type AggActivity = Row<AggSwapEvent, typeof AGG_ACTIVITY_FIELDS>
export type TransferActivity = Row<TransferEvent, typeof TRANSFER_FIELDS>
export type BondingCurveSwapDetail = Row<SwapEvent, typeof BC_DETAIL_FIELDS>
export type V3SwapDetail = Row<V3SwapEvent, typeof V3_DETAIL_FIELDS>

export interface SwapScanFilter {
    chainId: number
    sender?: string
    senders?: string[]
    since?: number
}

function scanWhere(filter: SwapScanFilter, senderField: 'sender' | 'txFrom') {
    const where: Record<string, unknown> = { chainId: filter.chainId }
    if (filter.sender) where[senderField] = filter.sender
    if (filter.senders) where[`${senderField}_in`] = filter.senders
    if (filter.since !== undefined) where.timestamp_gte = filter.since
    return where
}

export function fetchBondingCurveSwaps(
    client: PonderClient,
    filter: SwapScanFilter
): Promise<BondingCurveSwap[]> {
    return client.fetchAllPages<{ swapEvents: Page<BondingCurveSwap> }, BondingCurveSwap>(
        `query BondingCurveSwaps($where: swapEventFilter, $after: String) {
            swapEvents(
                where: $where
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(BC_SWAP_FIELDS)} }
            }
        }`,
        { where: scanWhere(filter, 'sender') },
        (r) => r.swapEvents
    )
}

export function fetchV3Swaps(client: PonderClient, filter: SwapScanFilter): Promise<V3Swap[]> {
    return client.fetchAllPages<{ v3SwapEvents: Page<V3Swap> }, V3Swap>(
        `query V3Swaps($where: v3SwapEventFilter, $after: String) {
            v3SwapEvents(
                where: $where
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(V3_SWAP_FIELDS)} }
            }
        }`,
        { where: scanWhere(filter, 'txFrom') },
        (r) => r.v3SwapEvents
    )
}

export function fetchV2Swaps(client: PonderClient, filter: SwapScanFilter): Promise<V2Swap[]> {
    return client.fetchAllPages<{ v2SwapEvents: Page<V2Swap> }, V2Swap>(
        `query V2Swaps($where: v2SwapEventFilter, $after: String) {
            v2SwapEvents(
                where: $where
                orderBy: "timestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(V2_SWAP_FIELDS)} }
            }
        }`,
        { where: scanWhere(filter, 'txFrom') },
        (r) => r.v2SwapEvents
    )
}

function parseBondingCurveSwap(e: BondingCurveSwap): ParsedSwap {
    return {
        tokenAddr: e.tokenAddr.toLowerCase(),
        sender: e.sender,
        isBuy: e.isBuy === 1,
        amountIn: e.amountIn,
        amountOut: e.amountOut,
        timestamp: e.timestamp,
        protocol: 'junoswap',
    }
}

export async function fetchUserSwapEvents(
    client: PonderClient,
    params: { chainId: number; address: string }
): Promise<ParsedSwap[]> {
    const { chainId } = params
    const wrappedNative = WRAPPED_NATIVE_ADDRESSES[chainId]?.toLowerCase()
    if (!wrappedNative) return []
    const sender = params.address.toLowerCase()
    const filter: SwapScanFilter = { chainId, sender }

    try {
        const [bondingCurveEvents, v3Rows, v2Rows] = await Promise.all([
            isLaunchpadChain(chainId)
                ? fetchBondingCurveSwaps(client, filter)
                : Promise.resolve([] as BondingCurveSwap[]),
            fetchV3Swaps(client, filter),
            fetchV2Swaps(client, filter),
        ])
        return [
            ...bondingCurveEvents.map(parseBondingCurveSwap),
            ...v3Rows.map((e) => parseV3Swap(e, wrappedNative)),
            ...v2Rows.map((e) => parseV2Swap(e, wrappedNative)),
        ]
            .filter((s): s is ParsedSwap => s !== null)
            .sort((a, b) => a.timestamp - b.timestamp)
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

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

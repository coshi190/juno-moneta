import type { Abi, Address } from 'viem'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '../../abis/nonfungible-position-manager.js'
import { ProtocolType, getDexConfig } from '../../configs/dex.js'
import { batchRead, type ReadClient, type SimulateClient } from '../../dex/multicall.js'
import {
    buildPoolAddressCalls,
    buildPoolStateCalls,
    buildPositionPoolKeys,
    decodePoolAddresses,
    decodePoolStates,
    foldPositions,
    type DescribedPosition,
    type FetchPositionsParams,
    type PositionInput,
} from '../../pool/positions.js'
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

const MAX_UINT128 = 2n ** 128n - 1n

async function collectFees(
    simulate: SimulateClient,
    positionManager: Address,
    positions: readonly PositionInput[]
): Promise<Map<string, { fees0: bigint; fees1: bigint }>> {
    const settled = await Promise.allSettled(
        positions.map((position) =>
            simulate.simulateContract({
                address: positionManager,
                abi: NONFUNGIBLE_POSITION_MANAGER_ABI as Abi,
                functionName: 'collect',
                account: position.owner as Address,
                args: [
                    {
                        tokenId: position.tokenId,
                        recipient: position.owner as Address,
                        amount0Max: MAX_UINT128,
                        amount1Max: MAX_UINT128,
                    },
                ],
            })
        )
    )

    const map = new Map<string, { fees0: bigint; fees1: bigint }>()
    settled.forEach((outcome, index) => {
        const position = positions[index]
        if (!position || outcome.status !== 'fulfilled') return
        const result = outcome.value.result as [bigint, bigint] | undefined
        if (!result) return
        map.set(position.tokenId.toString(), { fees0: result[0], fees1: result[1] })
    })
    return map
}

export async function fetchPositions(
    ponder: PonderClient,
    client: ReadClient,
    params: FetchPositionsParams
): Promise<DescribedPosition[]> {
    const config = getDexConfig(params.chainId, params.dexId, ProtocolType.V3)
    if (!config) return []

    const rows = params.positions
        ? []
        : params.owner
          ? await fetchUserPositions(ponder, {
                chainId: params.chainId,
                owner: params.owner,
                ...(params.limit === undefined ? {} : { limit: params.limit }),
            })
          : await fetchPositionsByTokenIds(ponder, {
                chainId: params.chainId,
                tokenIds: params.tokenIds ?? [],
                ...(params.limit === undefined ? {} : { limit: params.limit }),
            })

    const positions: PositionInput[] =
        params.positions ??
        rows.map((row) => ({
            tokenId: BigInt(row.tokenId),
            owner: row.owner,
            token0: row.token0,
            token1: row.token1,
            fee: row.fee,
            tickLower: row.tickLower,
            tickUpper: row.tickUpper,
            liquidity: BigInt(row.liquidity),
            tokensOwed0: BigInt(row.tokensOwed0),
            tokensOwed1: BigInt(row.tokensOwed1),
        }))
    if (positions.length === 0) return []

    const keys = buildPositionPoolKeys(positions)
    const missing = keys.filter((entry) => !params.poolAddresses?.has(entry.key))

    const resolved = new Map(params.poolAddresses ?? [])
    if (missing.length > 0) {
        const results = await batchRead(client, buildPoolAddressCalls(config.factory, missing))
        for (const [key, address] of decodePoolAddresses(missing, results)) {
            resolved.set(key, address)
        }
    }

    const pools = [...new Set(resolved.values())]
    const stateResults = await batchRead(client, buildPoolStateCalls(pools))
    const poolStates = decodePoolStates(pools, stateResults)

    const fees =
        params.simulate && config.positionManager
            ? await collectFees(params.simulate, config.positionManager, positions)
            : undefined

    return foldPositions({
        positions,
        poolAddresses: resolved,
        poolStates,
        ...(params.decimals === undefined ? {} : { decimals: params.decimals }),
        ...(fees === undefined ? {} : { fees }),
        ...(params.fullRangeTolerance === undefined
            ? {}
            : { fullRangeTolerance: params.fullRangeTolerance }),
    })
}

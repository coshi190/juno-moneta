import { zeroAddress, type Abi, type Address } from 'viem'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '../abis/nonfungible-position-manager.js'
import { UNISWAP_V3_FACTORY_ABI } from '../abis/uniswap-v3-factory.js'
import { UNISWAP_V3_POOL_ABI } from '../abis/uniswap-v3-pool.js'
import { ProtocolType, getDexConfig, getTickSpacing, type DEXType } from '../configs/dex.js'
import {
    batchRead,
    type ReadClient,
    type ReadResult,
    type SimulateClient,
} from '../dex/multicall.js'
import type { ContractCall } from '../dex/plan-swap.js'
import type { PonderClient } from '../ponder/client.js'
import { fetchPositionsByTokenIds, fetchUserPositions } from '../ponder/queries/positions.js'
import { getAmountsForLiquidity } from './liquidity-math.js'
import { computeTickPrice } from './pool-price.js'
import { computeValueFromPrices } from './pool-usd-math.js'
import { isInRange, tickToSqrtPriceX96 } from './tick-math.js'
import { isFullRange } from './tick-ranges.js'

const MAX_UINT128 = 2n ** 128n - 1n

export interface PositionInput {
    tokenId: bigint
    owner: string
    token0: string
    token1: string
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: bigint
    tokensOwed0: bigint
    tokensOwed1: bigint
}

export interface PositionPoolKey {
    key: string
    token0: string
    token1: string
    fee: number
}

export interface PoolStateInput {
    sqrtPriceX96: bigint
    tick: number
    liquidity: bigint
}

export interface DescribedPosition extends PositionInput {
    poolKey: string
    poolAddress: Address
    tickSpacing: number
    amount0: bigint
    amount1: bigint
    uncollectedFees0: bigint
    uncollectedFees1: bigint
    currentTick: number
    sqrtPriceX96: bigint
    poolLiquidity: bigint
    inRange: boolean
    isFullRange: boolean
    priceLower: number
    priceUpper: number
    currentPrice: number
}

export interface FetchPositionsParams {
    chainId: number
    owner?: string
    tokenIds?: bigint[]
    positions?: PositionInput[]
    dexId?: DEXType
    limit?: number
    poolAddresses?: Map<string, Address>
    simulate?: SimulateClient
    decimals?: Map<string, number>
    fullRangeTolerance?: number
}

export function getPositionPoolKey(token0: string, token1: string, fee: number): string {
    return `${token0.toLowerCase()}-${token1.toLowerCase()}-${fee}`
}

export function buildPositionPoolKeys(positions: readonly PositionInput[]): PositionPoolKey[] {
    const seen = new Map<string, PositionPoolKey>()
    for (const position of positions) {
        const key = getPositionPoolKey(position.token0, position.token1, position.fee)
        if (seen.has(key)) continue
        seen.set(key, { key, token0: position.token0, token1: position.token1, fee: position.fee })
    }
    return [...seen.values()]
}

export function buildPoolAddressCalls(
    factory: Address,
    keys: readonly PositionPoolKey[]
): ContractCall[] {
    return keys.map((entry) => ({
        address: factory,
        abi: UNISWAP_V3_FACTORY_ABI as Abi,
        functionName: 'getPool',
        args: [entry.token0 as Address, entry.token1 as Address, entry.fee],
    }))
}

export function decodePoolAddresses(
    keys: readonly PositionPoolKey[],
    results: readonly ReadResult[]
): Map<string, Address> {
    const map = new Map<string, Address>()
    keys.forEach((entry, index) => {
        const result = results[index]
        if (result?.status !== 'success') return
        const address = result.result as Address | undefined
        if (!address || address === zeroAddress) return
        map.set(entry.key, address)
    })
    return map
}

export function buildPoolStateCalls(pools: readonly Address[]): ContractCall[] {
    return pools.flatMap((pool) => [
        { address: pool, abi: UNISWAP_V3_POOL_ABI as Abi, functionName: 'slot0', args: [] },
        { address: pool, abi: UNISWAP_V3_POOL_ABI as Abi, functionName: 'liquidity', args: [] },
    ])
}

export function decodePoolStates(
    pools: readonly Address[],
    results: readonly ReadResult[]
): Map<string, PoolStateInput> {
    const map = new Map<string, PoolStateInput>()
    pools.forEach((pool, index) => {
        const slot0 = results[index * 2]
        const liquidity = results[index * 2 + 1]
        if (slot0?.status !== 'success') return
        const decoded = slot0.result as [bigint, number, ...unknown[]] | undefined
        if (!decoded) return
        map.set(pool.toLowerCase(), {
            sqrtPriceX96: decoded[0],
            tick: decoded[1],
            liquidity: liquidity?.status === 'success' ? (liquidity.result as bigint) : 0n,
        })
    })
    return map
}

export interface FoldPositionsParams {
    positions: readonly PositionInput[]
    poolAddresses: Map<string, Address>
    poolStates: Map<string, PoolStateInput>
    decimals?: Map<string, number>
    fees?: Map<string, { fees0: bigint; fees1: bigint }>
    fullRangeTolerance?: number
}

export function foldPositions(params: FoldPositionsParams): DescribedPosition[] {
    return params.positions.map((position) => {
        const poolKey = getPositionPoolKey(position.token0, position.token1, position.fee)
        const poolAddress = params.poolAddresses.get(poolKey)
        const state = poolAddress ? params.poolStates.get(poolAddress.toLowerCase()) : undefined

        const decimals0 = params.decimals?.get(position.token0.toLowerCase()) ?? 18
        const decimals1 = params.decimals?.get(position.token1.toLowerCase()) ?? 18

        const amounts = state
            ? getAmountsForLiquidity(
                  state.sqrtPriceX96,
                  tickToSqrtPriceX96(position.tickLower),
                  tickToSqrtPriceX96(position.tickUpper),
                  position.liquidity
              )
            : { amount0: 0n, amount1: 0n }

        const currentTick = state?.tick ?? position.tickLower
        const fees = params.fees?.get(position.tokenId.toString())

        return {
            ...position,
            poolKey,
            poolAddress: poolAddress ?? (zeroAddress as Address),
            tickSpacing: getTickSpacing(position.fee),
            amount0: amounts.amount0,
            amount1: amounts.amount1,
            uncollectedFees0: fees?.fees0 ?? position.tokensOwed0,
            uncollectedFees1: fees?.fees1 ?? position.tokensOwed1,
            currentTick,
            sqrtPriceX96: state?.sqrtPriceX96 ?? 0n,
            poolLiquidity: state?.liquidity ?? 0n,
            inRange: state ? isInRange(currentTick, position.tickLower, position.tickUpper) : false,
            isFullRange: isFullRange(
                position.tickLower,
                position.tickUpper,
                params.fullRangeTolerance
            ),
            priceLower: computeTickPrice({ tick: position.tickLower, decimals0, decimals1 }),
            priceUpper: computeTickPrice({ tick: position.tickUpper, decimals0, decimals1 }),
            currentPrice: state ? computeTickPrice({ tick: currentTick, decimals0, decimals1 }) : 0,
        }
    })
}

export function computePositionValueUsd(params: {
    amount0: bigint
    decimals0: number
    price0: number | undefined
    amount1: bigint
    decimals1: number
    price1: number | undefined
}): number | null {
    if (params.price0 === undefined || params.price1 === undefined) return null
    const value = computeValueFromPrices(
        params.amount0,
        params.decimals0,
        params.amount1,
        params.decimals1,
        params.price0,
        params.price1
    )
    return Number.isFinite(value) ? value : null
}

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

import { zeroAddress, type Abi, type Address } from 'viem'
import { V3_FACTORY_ABI } from '../abis/v3-factory.js'
import { V3_POOL_ABI } from '../abis/v3-pool.js'
import { getTickSpacing, type DEXType } from '../configs/dex.js'
import type { ReadResult, SimulateClient } from '../dex/multicall.js'
import type { ContractCall } from '../dex/plan-swap.js'
import { getAmountsForLiquidity } from './liquidity-math.js'
import { computeTickPrice } from './pool-math.js'
import { isFullRange, isInRange, tickToSqrtPriceX96 } from './tick-math.js'

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

interface PositionPoolKey {
    key: string
    token0: string
    token1: string
    fee: number
}

interface PoolStateInput {
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
        abi: V3_FACTORY_ABI as Abi,
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
        { address: pool, abi: V3_POOL_ABI as Abi, functionName: 'slot0', args: [] },
        { address: pool, abi: V3_POOL_ABI as Abi, functionName: 'liquidity', args: [] },
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

interface FoldPositionsParams {
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

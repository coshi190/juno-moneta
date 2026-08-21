import {
    calculateAmount0FromAmount1,
    calculateAmount1FromAmount0,
    calculateMinAmounts,
    getAmountsForLiquidity,
} from './liquidity-math.js'
import { priceToSqrtPriceX96, sortTokens, tickToSqrtPriceX96 } from './tick-math.js'
import { snapTickRange, type TickRange } from './tick-ranges.js'

export interface DependentAmountParams {
    sqrtPriceX96: bigint
    tickLower: number
    tickUpper: number
    amount: bigint
    side: 'token0' | 'token1'
    invert?: boolean
}

export interface InitialPriceParams {
    price: string
    decimals0: number
    decimals1: number
    invert?: boolean
}

export interface LiquidityPlan {
    amount0Min: bigint
    amount1Min: bigint
    deadline: bigint
}

export interface PlanAddLiquidityParams {
    token0: { address: string; decimals: number }
    token1: { address: string; decimals: number }
    fee: number
    tickSpacing: number
    tickLower: number
    tickUpper: number
    amount0Desired: bigint
    amount1Desired: bigint
    slippageBps: number
    deadlineMinutes: number
    initialPrice?: string
    nowSeconds?: number
}

export interface AddLiquidityPlan extends LiquidityPlan {
    token0: string
    token1: string
    inverted: boolean
    fee: number
    tickLower: number
    tickUpper: number
    amount0Desired: bigint
    amount1Desired: bigint
    initialSqrtPriceX96: bigint | null
}

export interface PlanIncreaseLiquidityParams {
    tokenId: bigint
    amount0Desired: bigint
    amount1Desired: bigint
    slippageBps: number
    deadlineMinutes: number
    nowSeconds?: number
}

export interface IncreaseLiquidityPlan extends LiquidityPlan {
    tokenId: bigint
    amount0Desired: bigint
    amount1Desired: bigint
}

export interface PlanRemoveLiquidityParams {
    liquidity: bigint
    percentage: number
    sqrtPriceX96: bigint
    tickLower: number
    tickUpper: number
    slippageBps: number
    deadlineMinutes: number
    nowSeconds?: number
}

export interface RemoveLiquidityPlan extends LiquidityPlan {
    liquidity: bigint
    amount0: bigint
    amount1: bigint
}

function resolveDeadline(deadlineMinutes: number, nowSeconds: number | undefined): bigint {
    const base = nowSeconds ?? Math.floor(Date.now() / 1000)
    return BigInt(base + deadlineMinutes * 60)
}

function mirrorRange(tickLower: number, tickUpper: number, invert: boolean | undefined): TickRange {
    if (!invert) return { tickLower, tickUpper }
    return { tickLower: -tickUpper, tickUpper: -tickLower }
}

export function computeDependentAmount(params: DependentAmountParams): bigint {
    const { tickLower, tickUpper } = mirrorRange(params.tickLower, params.tickUpper, params.invert)
    const sqrtPriceLowerX96 = tickToSqrtPriceX96(tickLower)
    const sqrtPriceUpperX96 = tickToSqrtPriceX96(tickUpper)
    const poolSide = params.invert ? (params.side === 'token0' ? 'token1' : 'token0') : params.side

    if (poolSide === 'token0') {
        return calculateAmount1FromAmount0(
            params.sqrtPriceX96,
            sqrtPriceLowerX96,
            sqrtPriceUpperX96,
            params.amount
        )
    }
    return calculateAmount0FromAmount1(
        params.sqrtPriceX96,
        sqrtPriceLowerX96,
        sqrtPriceUpperX96,
        params.amount
    )
}

export function computeInitialSqrtPriceX96(params: InitialPriceParams): bigint {
    const parsed = parseFloat(params.price)
    const oriented = params.invert && parsed > 0 ? 1 / parsed : parsed
    return priceToSqrtPriceX96(String(oriented), params.decimals0, params.decimals1)
}

export function planAddLiquidity(params: PlanAddLiquidityParams): AddLiquidityPlan {
    const [poolToken0, poolToken1] = sortTokens(params.token0, params.token1)
    const inverted = poolToken0.address.toLowerCase() !== params.token0.address.toLowerCase()

    const mirrored = mirrorRange(params.tickLower, params.tickUpper, inverted)
    const range = snapTickRange(mirrored.tickLower, mirrored.tickUpper, params.tickSpacing)

    const amount0Desired = inverted ? params.amount1Desired : params.amount0Desired
    const amount1Desired = inverted ? params.amount0Desired : params.amount1Desired

    const { amount0Min, amount1Min } = calculateMinAmounts(
        amount0Desired,
        amount1Desired,
        params.slippageBps
    )

    const initialSqrtPriceX96 =
        params.initialPrice === undefined
            ? null
            : computeInitialSqrtPriceX96({
                  price: params.initialPrice,
                  decimals0: poolToken0.decimals,
                  decimals1: poolToken1.decimals,
                  invert: inverted,
              })

    return {
        token0: poolToken0.address,
        token1: poolToken1.address,
        inverted,
        fee: params.fee,
        tickLower: range.tickLower,
        tickUpper: range.tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline: resolveDeadline(params.deadlineMinutes, params.nowSeconds),
        initialSqrtPriceX96,
    }
}

export function planIncreaseLiquidity(params: PlanIncreaseLiquidityParams): IncreaseLiquidityPlan {
    const { amount0Min, amount1Min } = calculateMinAmounts(
        params.amount0Desired,
        params.amount1Desired,
        params.slippageBps
    )
    return {
        tokenId: params.tokenId,
        amount0Desired: params.amount0Desired,
        amount1Desired: params.amount1Desired,
        amount0Min,
        amount1Min,
        deadline: resolveDeadline(params.deadlineMinutes, params.nowSeconds),
    }
}

export function planRemoveLiquidity(params: PlanRemoveLiquidityParams): RemoveLiquidityPlan {
    const liquidity = (params.liquidity * BigInt(params.percentage)) / 100n
    const { amount0, amount1 } = getAmountsForLiquidity(
        params.sqrtPriceX96,
        tickToSqrtPriceX96(params.tickLower),
        tickToSqrtPriceX96(params.tickUpper),
        liquidity
    )
    const { amount0Min, amount1Min } = calculateMinAmounts(amount0, amount1, params.slippageBps)
    return {
        liquidity,
        amount0,
        amount1,
        amount0Min,
        amount1Min,
        deadline: resolveDeadline(params.deadlineMinutes, params.nowSeconds),
    }
}

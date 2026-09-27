import { calculateMinAmounts, getAmountsForLiquidity } from './liquidity-math.js'
import { priceToSqrtPriceX96, snapTickRange, sortTokens, tickToSqrtPriceX96 } from './tick-math.js'

interface PlanSettings {
    slippageBps: number
    deadlineMinutes: number
    nowSeconds?: number
}

export interface PlanAddLiquidityParams extends PlanSettings {
    token0: { address: string; decimals: number }
    token1: { address: string; decimals: number }
    fee: number
    tickSpacing: number
    tickLower: number
    tickUpper: number
    amount0Desired: bigint
    amount1Desired: bigint
    initialPrice?: string
}

export interface PlanIncreaseLiquidityParams extends PlanSettings {
    tokenId: bigint
    amount0Desired: bigint
    amount1Desired: bigint
}

export interface PlanRemoveLiquidityParams extends PlanSettings {
    liquidity: bigint
    percentage: number
    sqrtPriceX96: bigint
    tickLower: number
    tickUpper: number
}

function bounds(amount0: bigint, amount1: bigint, settings: PlanSettings) {
    const now = settings.nowSeconds ?? Math.floor(Date.now() / 1000)
    return {
        ...calculateMinAmounts(amount0, amount1, settings.slippageBps),
        deadline: BigInt(now + settings.deadlineMinutes * 60),
    }
}

export function planAddLiquidity(params: PlanAddLiquidityParams) {
    const [token0, token1] = sortTokens(params.token0, params.token1)
    const inverted = token0.address.toLowerCase() !== params.token0.address.toLowerCase()
    const { tickLower, tickUpper } = inverted
        ? snapTickRange(-params.tickUpper, -params.tickLower, params.tickSpacing)
        : snapTickRange(params.tickLower, params.tickUpper, params.tickSpacing)
    const amount0Desired = inverted ? params.amount1Desired : params.amount0Desired
    const amount1Desired = inverted ? params.amount0Desired : params.amount1Desired

    let initialSqrtPriceX96: bigint | null = null
    if (params.initialPrice !== undefined) {
        const price = parseFloat(params.initialPrice)
        const oriented = inverted && price > 0 ? 1 / price : price
        initialSqrtPriceX96 = priceToSqrtPriceX96(oriented, token0.decimals, token1.decimals)
    }

    return {
        token0: token0.address,
        token1: token1.address,
        inverted,
        fee: params.fee,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        ...bounds(amount0Desired, amount1Desired, params),
        initialSqrtPriceX96,
    }
}

export function planIncreaseLiquidity(params: PlanIncreaseLiquidityParams) {
    const { tokenId, amount0Desired, amount1Desired } = params
    return {
        tokenId,
        amount0Desired,
        amount1Desired,
        ...bounds(amount0Desired, amount1Desired, params),
    }
}

export function planRemoveLiquidity(params: PlanRemoveLiquidityParams) {
    const liquidity = (params.liquidity * BigInt(params.percentage)) / 100n
    const { amount0, amount1 } = getAmountsForLiquidity(
        params.sqrtPriceX96,
        tickToSqrtPriceX96(params.tickLower),
        tickToSqrtPriceX96(params.tickUpper),
        liquidity
    )
    return { liquidity, amount0, amount1, ...bounds(amount0, amount1, params) }
}

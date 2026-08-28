import { getStablecoins, getWrappedNativeAddress } from '../configs/chains.js'
import { priceFromSqrtPriceX96 } from './pool-usd-math.js'
import { nearestUsableTick, priceToTick, tickToSqrtPriceX96 } from './tick-math.js'

const Q96 = 2n ** 96n

export interface PoolPriceParams {
    sqrtPriceX96: bigint
    decimals0: number
    decimals1: number
    invert?: boolean
}

export interface TickPriceParams {
    tick: number
    decimals0: number
    decimals1: number
    invert?: boolean
}

export interface TickForPriceParams {
    price: string
    decimals0: number
    decimals1: number
    invert?: boolean
    tickSpacing?: number
}

export interface PoolDisplayOrder {
    base: string
    quote: string
    invert: boolean
}

function orient(price: number, invert: boolean | undefined): number {
    if (!invert) return price
    return price > 0 ? 1 / price : 0
}

export function computePoolPrice(params: PoolPriceParams): number {
    const price = priceFromSqrtPriceX96(params.sqrtPriceX96, params.decimals0, params.decimals1)
    return orient(price, params.invert)
}

export function computeTickPrice(params: TickPriceParams): number {
    return computePoolPrice({
        sqrtPriceX96: tickToSqrtPriceX96(params.tick),
        decimals0: params.decimals0,
        decimals1: params.decimals1,
        ...(params.invert === undefined ? {} : { invert: params.invert }),
    })
}

export function getTickForPrice(params: TickForPriceParams): number {
    const parsed = parseFloat(params.price)
    const oriented = params.invert && parsed > 0 ? 1 / parsed : parsed
    const tick = priceToTick(String(oriented), params.decimals0, params.decimals1)
    if (params.tickSpacing === undefined) return tick
    return nearestUsableTick(tick, params.tickSpacing)
}

export function invertSqrtPriceX96(sqrtPriceX96: bigint): bigint {
    if (sqrtPriceX96 <= 0n) return 0n
    return (Q96 * Q96) / sqrtPriceX96
}

export function getPoolDisplayOrder(
    chainId: number,
    token0: string,
    token1: string
): PoolDisplayOrder {
    const stables = getStablecoins(chainId)
    const wrapped = getWrappedNativeAddress(chainId)?.toLowerCase()
    const a = token0.toLowerCase()
    const b = token1.toLowerCase()

    const quoteIsToken0 =
        (stables?.has(a) && !stables.has(b)) || (!stables?.has(b) && a === wrapped && b !== wrapped)

    if (quoteIsToken0) return { base: token1, quote: token0, invert: true }
    return { base: token0, quote: token1, invert: false }
}

import { formatEther } from 'viem'
import { TOTAL_SUPPLY } from './bonding-curve.js'
import { priceFromSqrtPriceX96 } from '../pool/pool-tvl-math.js'

export const VIRTUAL_AMOUNT = 3400n * 10n ** 18n

export interface CurveSwapEvent {
    timestamp: number
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    sender?: string
}

export function calculatePrice(event: CurveSwapEvent): number {
    const nativeReserve = event.isBuy ? event.reserveIn : event.reserveOut
    const tokenReserve = event.isBuy ? event.reserveOut : event.reserveIn
    if (nativeReserve === 0n || tokenReserve === 0n) return 0
    const effectiveReserve = parseFloat(formatEther(nativeReserve + VIRTUAL_AMOUNT))
    const tokenRes = parseFloat(formatEther(tokenReserve))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

export function calculateMarketCapValue(event: CurveSwapEvent): number {
    return calculatePrice(event) * TOTAL_SUPPLY
}

export function calculatePreSwapPrice(event: CurveSwapEvent): number {
    let preNative: bigint, preToken: bigint
    if (event.isBuy) {
        preNative = event.reserveIn - event.amountIn
        preToken = event.reserveOut + event.amountOut
    } else {
        preNative = event.reserveOut + event.amountOut
        preToken = event.reserveIn - event.amountIn
    }
    if (preNative < 0n || preToken <= 0n) return 0
    const effectiveReserve = parseFloat(formatEther(preNative + VIRTUAL_AMOUNT))
    const tokenRes = parseFloat(formatEther(preToken))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

export function calculatePriceFromSqrtPrice(sqrtPriceX96: bigint, tokenIsToken0: boolean): number {
    if (sqrtPriceX96 <= 0n) return 0
    const price = priceFromSqrtPriceX96(sqrtPriceX96, 18, 18)
    if (tokenIsToken0) return price
    return price > 0 ? 1 / price : 0
}

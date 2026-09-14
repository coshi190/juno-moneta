import { formatEther, parseEther } from 'viem'
import { bigIntSqrt } from '../pool/liquidity-math.js'

const PUMP_FEE_BPS = 100n

const INITIAL_TOKEN_SUPPLY = 1000000000n * 10n ** 18n

const TOTAL_SUPPLY = 1_000_000_000

const VIRTUAL_AMOUNT = 3400n * 10n ** 18n

const MAX_UINT160 = (1n << 160n) - 1n

function getAmountOut(inputAmount: bigint, inputReserve: bigint, outputReserve: bigint): bigint {
    if (inputReserve <= 0n || outputReserve <= 0n) return 0n
    const inputAmountWithFee = inputAmount * 99n
    const numerator = outputReserve * inputAmountWithFee
    const denominator = inputReserve * 100n + inputAmountWithFee
    return numerator / denominator
}

function buyOutput(
    nativeAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualAmount: bigint
): bigint {
    if (nativeAmountIn <= 0n || nativeReserve < 0n || tokenReserve <= 0n) return 0n
    const feeAmount = (nativeAmountIn * PUMP_FEE_BPS) / 10000n
    const amountInAfterFee = nativeAmountIn - feeAmount
    return getAmountOut(amountInAfterFee, virtualAmount + nativeReserve, tokenReserve)
}

function sellOutput(
    tokenAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualAmount: bigint
): bigint {
    if (tokenAmountIn <= 0n || tokenReserve <= 0n || nativeReserve <= 0n) return 0n
    const feeAmount = (tokenAmountIn * PUMP_FEE_BPS) / 10000n
    const amountInAfterFee = tokenAmountIn - feeAmount
    return getAmountOut(amountInAfterFee, tokenReserve, virtualAmount + nativeReserve)
}

function graduationTarget(tokenReserve: bigint, graduationAmount: bigint): bigint {
    if (graduationAmount <= 0n) return 0n
    return (tokenReserve * graduationAmount) / INITIAL_TOKEN_SUPPLY
}

function exactGraduationReserve(virtualAmount: bigint, graduationAmount: bigint): bigint {
    if (virtualAmount <= 0n || graduationAmount <= 0n) return graduationAmount

    const V = Number(formatEther(virtualAmount))
    const G = Number(formatEther(graduationAmount))
    const FEE_EXP = 0.99
    const target = G * Math.pow(V, FEE_EXP)

    let N = (-V + Math.sqrt(V * V + 4 * V * G)) / 2

    for (let i = 0; i < 20; i++) {
        const base = V + N
        const f = N * Math.pow(base, FEE_EXP) - target
        const fPrime = Math.pow(base, FEE_EXP) + N * FEE_EXP * Math.pow(base, FEE_EXP - 1)
        const step = f / fPrime
        N = Math.max(0, N - step)
        if (Math.abs(step) < 1e-9) break
    }

    return parseEther(N.toFixed(18))
}

function stableProgress(nativeReserve: bigint, exactTarget: bigint): number {
    if (exactTarget <= 0n) return 0
    const progress = Number((nativeReserve * 100n) / exactTarget)
    return Math.min(100, progress)
}

function readyToGraduate(
    nativeReserve: bigint,
    tokenReserve: bigint,
    graduationAmount: bigint,
    isGraduated: boolean
): boolean {
    if (isGraduated || graduationAmount === 0n) return false
    return tokenReserve * graduationAmount <= INITIAL_TOKEN_SUPPLY * nativeReserve
}

function graduationSqrtPriceX96(
    tokenAddr: `0x${string}` | undefined,
    wrappedNative: `0x${string}` | undefined,
    nativeReserve: bigint,
    tokenReserve: bigint
): bigint {
    if (!tokenAddr || !wrappedNative || nativeReserve <= 0n || tokenReserve <= 0n) return 0n

    const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNative.toLowerCase()

    const amount0 = tokenIsToken0 ? tokenReserve : nativeReserve
    const amount1 = tokenIsToken0 ? nativeReserve : tokenReserve

    const Q192 = 2n ** 192n
    const priceX192 = (amount1 * Q192) / amount0

    const sqrtPriceX96 = bigIntSqrt(priceX192)

    return sqrtPriceX96 > MAX_UINT160 ? MAX_UINT160 : sqrtPriceX96
}

function spotPrice(nativeReserve: bigint, tokenReserve: bigint, virtualAmount: bigint): number {
    if (tokenReserve <= 0n) return 0
    const tokenRes = parseFloat(formatEther(tokenReserve))
    if (tokenRes === 0) return 0
    return parseFloat(formatEther(nativeReserve + virtualAmount)) / tokenRes
}

export interface CurveSwap {
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
}

export interface CurveInputs {
    nativeReserve: bigint
    tokenReserve: bigint
    virtualAmount?: bigint
    graduationAmount?: bigint
    isGraduated?: boolean
    buyAmountIn?: bigint
    sellAmountIn?: bigint
    token?: `0x${string}`
    wrappedNative?: `0x${string}`
    swap?: CurveSwap
}

export interface CurveGraduation {
    target: bigint
    exactReserve: bigint
    progress: number
    isReady: boolean
    sqrtPriceX96: bigint
}

export interface CurveResult {
    price: number
    marketCap: number
    preSwapPrice: number
    preSwapMarketCap: number
    buyOutput: bigint
    sellOutput: bigint
    graduation: CurveGraduation
}

export function computeCurve(input: CurveInputs): CurveResult {
    const {
        nativeReserve,
        tokenReserve,
        virtualAmount = VIRTUAL_AMOUNT,
        graduationAmount = 0n,
        isGraduated = false,
        buyAmountIn = 0n,
        sellAmountIn = 0n,
        token,
        wrappedNative,
        swap,
    } = input

    const price = spotPrice(nativeReserve, tokenReserve, virtualAmount)

    let preSwapPrice = price
    if (swap) {
        const preNative = swap.isBuy
            ? nativeReserve - swap.amountIn
            : nativeReserve + swap.amountOut
        const preToken = swap.isBuy ? tokenReserve + swap.amountOut : tokenReserve - swap.amountIn
        preSwapPrice =
            preNative < 0n || preToken <= 0n ? 0 : spotPrice(preNative, preToken, virtualAmount)
    }

    const exactReserve = exactGraduationReserve(virtualAmount, graduationAmount)

    return {
        price,
        marketCap: price * TOTAL_SUPPLY,
        preSwapPrice,
        preSwapMarketCap: preSwapPrice * TOTAL_SUPPLY,
        buyOutput: buyOutput(buyAmountIn, nativeReserve, tokenReserve, virtualAmount),
        sellOutput: sellOutput(sellAmountIn, nativeReserve, tokenReserve, virtualAmount),
        graduation: {
            target: graduationTarget(tokenReserve, graduationAmount),
            exactReserve,
            progress: stableProgress(nativeReserve, exactReserve),
            isReady: readyToGraduate(nativeReserve, tokenReserve, graduationAmount, isGraduated),
            sqrtPriceX96: graduationSqrtPriceX96(token, wrappedNative, nativeReserve, tokenReserve),
        },
    }
}

import { formatEther, parseEther } from 'viem'
import { bigIntSqrt } from '../pool/liquidity-math.js'

const MAX_UINT160 = (1n << 160n) - 1n

export interface CurveParams {
    virtualReserve: bigint
    totalSupply: bigint
    graduationAmount: bigint
    feeBps: number
    creatorShareBps: number
}

const JUNOSWAP_V1_CURVE: CurveParams = {
    virtualReserve: 3400n * 10n ** 18n,
    totalSupply: 1000000000n * 10n ** 18n,
    graduationAmount: 0n,
    feeBps: 100,
    creatorShareBps: 5000,
}

function getAmountOut(
    inputAmount: bigint,
    inputReserve: bigint,
    outputReserve: bigint,
    feeBps: bigint
): bigint {
    if (inputReserve <= 0n || outputReserve <= 0n) return 0n
    const inputAmountWithFee = inputAmount * (10000n - feeBps)
    const numerator = outputReserve * inputAmountWithFee
    const denominator = inputReserve * 10000n + inputAmountWithFee
    return numerator / denominator
}

function buyOutput(
    nativeAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualReserve: bigint,
    feeBps: bigint
): bigint {
    if (nativeAmountIn <= 0n || nativeReserve < 0n || tokenReserve <= 0n) return 0n
    const amountInAfterFee = nativeAmountIn - (nativeAmountIn * feeBps) / 10000n
    return getAmountOut(amountInAfterFee, virtualReserve + nativeReserve, tokenReserve, feeBps)
}

function sellOutput(
    tokenAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualReserve: bigint,
    feeBps: bigint
): bigint {
    if (tokenAmountIn <= 0n || tokenReserve <= 0n || nativeReserve <= 0n) return 0n
    const amountInAfterFee = tokenAmountIn - (tokenAmountIn * feeBps) / 10000n
    return getAmountOut(amountInAfterFee, tokenReserve, virtualReserve + nativeReserve, feeBps)
}

function graduationTarget(
    tokenReserve: bigint,
    graduationAmount: bigint,
    totalSupply: bigint
): bigint {
    if (graduationAmount <= 0n || totalSupply <= 0n) return 0n
    return (tokenReserve * graduationAmount) / totalSupply
}

function exactGraduationReserve(
    virtualAmount: bigint,
    graduationAmount: bigint,
    feeBps: number
): bigint {
    if (virtualAmount <= 0n || graduationAmount <= 0n) return graduationAmount

    const V = Number(formatEther(virtualAmount))
    const G = Number(formatEther(graduationAmount))
    const FEE_EXP = (10000 - feeBps) / 10000
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
    totalSupply: bigint,
    isGraduated: boolean
): boolean {
    if (isGraduated || graduationAmount === 0n) return false
    return tokenReserve * graduationAmount <= totalSupply * nativeReserve
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
    curve?: CurveParams
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
        curve = JUNOSWAP_V1_CURVE,
        isGraduated = false,
        buyAmountIn = 0n,
        sellAmountIn = 0n,
        token,
        wrappedNative,
        swap,
    } = input

    const graduationAmount = input.graduationAmount ?? curve.graduationAmount
    const virtualReserve = input.virtualAmount ?? curve.virtualReserve
    const feeBps = BigInt(curve.feeBps)
    const { totalSupply } = curve
    const supply = parseFloat(formatEther(totalSupply))

    const price = spotPrice(nativeReserve, tokenReserve, virtualReserve)

    let preSwapPrice = price
    if (swap) {
        const preNative = swap.isBuy
            ? nativeReserve - swap.amountIn
            : nativeReserve + swap.amountOut
        const preToken = swap.isBuy ? tokenReserve + swap.amountOut : tokenReserve - swap.amountIn
        preSwapPrice =
            preNative < 0n || preToken <= 0n ? 0 : spotPrice(preNative, preToken, virtualReserve)
    }

    const exactReserve = exactGraduationReserve(virtualReserve, graduationAmount, curve.feeBps)

    return {
        price,
        marketCap: price * supply,
        preSwapPrice,
        preSwapMarketCap: preSwapPrice * supply,
        buyOutput: buyOutput(buyAmountIn, nativeReserve, tokenReserve, virtualReserve, feeBps),
        sellOutput: sellOutput(sellAmountIn, nativeReserve, tokenReserve, virtualReserve, feeBps),
        graduation: {
            target: graduationTarget(tokenReserve, graduationAmount, totalSupply),
            exactReserve,
            progress: stableProgress(nativeReserve, exactReserve),
            isReady: readyToGraduate(
                nativeReserve,
                tokenReserve,
                graduationAmount,
                totalSupply,
                isGraduated
            ),
            sqrtPriceX96: graduationSqrtPriceX96(token, wrappedNative, nativeReserve, tokenReserve),
        },
    }
}

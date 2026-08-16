import { formatEther, parseEther } from 'viem'
import { bigIntSqrt } from '../pool/liquidity-math.js'

export const PUMP_FEE_BPS = 100n

export const INITIAL_TOKEN_SUPPLY = 1000000000n * 10n ** 18n

export const TOTAL_SUPPLY = 1_000_000_000

function getAmountOut(inputAmount: bigint, inputReserve: bigint, outputReserve: bigint): bigint {
    if (inputReserve <= 0n || outputReserve <= 0n) return 0n
    const inputAmountWithFee = inputAmount * 99n
    const numerator = outputReserve * inputAmountWithFee
    const denominator = inputReserve * 100n + inputAmountWithFee
    return numerator / denominator
}

export function calculateBuyOutput(
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

export function calculateSellOutput(
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

export function calculateGraduationTarget(tokenReserve: bigint, graduationAmount: bigint): bigint {
    if (graduationAmount <= 0n) return 0n
    return (tokenReserve * graduationAmount) / INITIAL_TOKEN_SUPPLY
}

export function calculateGraduationProgress(
    nativeReserve: bigint,
    tokenReserve: bigint,
    graduationAmount: bigint
): number {
    if (graduationAmount <= 0n || tokenReserve <= 0n) return 0
    const progress = Number(
        (INITIAL_TOKEN_SUPPLY * nativeReserve * 100n) / (tokenReserve * graduationAmount)
    )
    return Math.min(100, progress)
}

export function calculateExactGraduationReserve(
    virtualAmount: bigint,
    graduationAmount: bigint
): bigint {
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

export function calculateStableGraduationProgress(
    nativeReserve: bigint,
    exactTarget: bigint
): number {
    if (exactTarget <= 0n) return 0
    const progress = Number((nativeReserve * 100n) / exactTarget)
    return Math.min(100, progress)
}

export function isReadyToGraduate(
    nativeReserve: bigint,
    tokenReserve: bigint,
    graduationAmount: bigint,
    isGraduated: boolean
): boolean {
    if (isGraduated || graduationAmount === 0n) return false
    return tokenReserve * graduationAmount <= INITIAL_TOKEN_SUPPLY * nativeReserve
}

export function isSqrtPriceWithinTolerance(
    current: bigint,
    target: bigint,
    toleranceBps: bigint
): boolean {
    if (target <= 0n) return false
    const diff = current > target ? current - target : target - current
    return diff <= (target * toleranceBps) / 10000n
}

export const PRICE_TOLERANCE_BPS = 400n

export function calculateGraduationSqrtPriceX96(
    tokenAddr: `0x${string}`,
    wrappedNative: `0x${string}`,
    nativeReserve: bigint,
    tokenReserve: bigint
): bigint {
    if (nativeReserve <= 0n || tokenReserve <= 0n) {
        throw new Error('Invalid reserves for sqrtPriceX96 calculation')
    }

    const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNative.toLowerCase()

    const amount0 = tokenIsToken0 ? tokenReserve : nativeReserve
    const amount1 = tokenIsToken0 ? nativeReserve : tokenReserve

    const Q192 = 2n ** 192n
    const priceX192 = (amount1 * Q192) / amount0

    const sqrtPriceX96 = bigIntSqrt(priceX192)

    const MAX_UINT160 = (1n << 160n) - 1n
    return sqrtPriceX96 > MAX_UINT160 ? MAX_UINT160 : sqrtPriceX96
}

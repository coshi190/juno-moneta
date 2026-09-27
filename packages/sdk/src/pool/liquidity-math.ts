const Q96 = 2n ** 96n

export function bigIntSqrt(n: bigint): bigint {
    if (n < 0n) throw new Error('square root of negative')
    if (n < 2n) return n

    let x = 1n << BigInt((n.toString(2).length + 1) >> 1)
    let y = (x + n / x) / 2n
    while (y < x) {
        x = y
        y = (x + n / x) / 2n
    }
    return x
}

export function getAmountsForLiquidity(
    sqrtPriceX96: bigint,
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    liquidity: bigint
): { amount0: bigint; amount1: bigint } {
    const [lower, upper] =
        sqrtPriceAX96 < sqrtPriceBX96
            ? [sqrtPriceAX96, sqrtPriceBX96]
            : [sqrtPriceBX96, sqrtPriceAX96]
    const price = sqrtPriceX96 < lower ? lower : sqrtPriceX96 > upper ? upper : sqrtPriceX96
    return {
        amount0: (liquidity * Q96 * (upper - price)) / upper / price,
        amount1: (liquidity * (price - lower)) / Q96,
    }
}

export function calculateMinAmounts(
    amount0: bigint,
    amount1: bigint,
    slippageBps: number
): { amount0Min: bigint; amount1Min: bigint } {
    const slippageMultiplier = 10000n - BigInt(slippageBps)
    return {
        amount0Min: (amount0 * slippageMultiplier) / 10000n,
        amount1Min: (amount1 * slippageMultiplier) / 10000n,
    }
}

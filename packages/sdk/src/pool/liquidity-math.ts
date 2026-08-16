const Q96 = 2n ** 96n

export function bigIntSqrt(n: bigint): bigint {
    if (n < 0n) throw new Error('square root of negative')
    if (n < 2n) return n

    let x = 1n << ((bitLength(n) + 1n) / 2n)
    let y = (x + n / x) / 2n
    while (y < x) {
        x = y
        y = (x + n / x) / 2n
    }
    return x
}

function bitLength(n: bigint): bigint {
    let len = 0n
    while (n > 0n) {
        n >>= 1n
        len++
    }
    return len
}

export function getLiquidityForAmount0(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    amount0: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    const intermediate = (sqrtPriceAX96 * sqrtPriceBX96) / Q96
    return (amount0 * intermediate) / (sqrtPriceBX96 - sqrtPriceAX96)
}

export function getLiquidityForAmount1(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    amount1: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    return (amount1 * Q96) / (sqrtPriceBX96 - sqrtPriceAX96)
}

export function getAmount0ForLiquidity(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    liquidity: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    return (liquidity * Q96 * (sqrtPriceBX96 - sqrtPriceAX96)) / sqrtPriceBX96 / sqrtPriceAX96
}

export function getAmount1ForLiquidity(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    liquidity: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    return (liquidity * (sqrtPriceBX96 - sqrtPriceAX96)) / Q96
}

export function getAmountsForLiquidity(
    sqrtPriceX96: bigint,
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    liquidity: bigint
): { amount0: bigint; amount1: bigint } {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }

    if (sqrtPriceX96 <= sqrtPriceAX96) {
        return {
            amount0: getAmount0ForLiquidity(sqrtPriceAX96, sqrtPriceBX96, liquidity),
            amount1: 0n,
        }
    } else if (sqrtPriceX96 < sqrtPriceBX96) {
        return {
            amount0: getAmount0ForLiquidity(sqrtPriceX96, sqrtPriceBX96, liquidity),
            amount1: getAmount1ForLiquidity(sqrtPriceAX96, sqrtPriceX96, liquidity),
        }
    } else {
        return {
            amount0: 0n,
            amount1: getAmount1ForLiquidity(sqrtPriceAX96, sqrtPriceBX96, liquidity),
        }
    }
}

export function calculateAmount1FromAmount0(
    sqrtPriceX96: bigint,
    sqrtPriceLowerX96: bigint,
    sqrtPriceUpperX96: bigint,
    amount0: bigint
): bigint {
    if (amount0 === 0n) return 0n

    if (sqrtPriceLowerX96 > sqrtPriceUpperX96) {
        ;[sqrtPriceLowerX96, sqrtPriceUpperX96] = [sqrtPriceUpperX96, sqrtPriceLowerX96]
    }

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        return 0n
    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        return 0n
    } else {
        const liquidity = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceUpperX96, amount0)
        return getAmount1ForLiquidity(sqrtPriceLowerX96, sqrtPriceX96, liquidity)
    }
}

export function calculateAmount0FromAmount1(
    sqrtPriceX96: bigint,
    sqrtPriceLowerX96: bigint,
    sqrtPriceUpperX96: bigint,
    amount1: bigint
): bigint {
    if (amount1 === 0n) return 0n

    if (sqrtPriceLowerX96 > sqrtPriceUpperX96) {
        ;[sqrtPriceLowerX96, sqrtPriceUpperX96] = [sqrtPriceUpperX96, sqrtPriceLowerX96]
    }

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        return 0n
    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        return 0n
    } else {
        const liquidity = getLiquidityForAmount1(sqrtPriceLowerX96, sqrtPriceX96, amount1)
        return getAmount0ForLiquidity(sqrtPriceX96, sqrtPriceUpperX96, liquidity)
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

export function calculateDeadline(deadlineMinutes: number): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60)
}

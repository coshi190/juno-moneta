const Q96 = 2n ** 96n

export const MIN_TICK = -887272

export const MAX_TICK = 887272

export const MIN_SQRT_RATIO = 4295128739n

export function tickToSqrtPriceX96(tick: number): bigint {
    const absTick = Math.abs(tick)
    let ratio: bigint

    if (absTick & 0x1) {
        ratio = 0xfffcb933bd6fad37aa2d162d1a594001n
    } else {
        ratio = 0x100000000000000000000000000000000n
    }
    if (absTick & 0x2) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n
    if (absTick & 0x4) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n
    if (absTick & 0x8) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n
    if (absTick & 0x10) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n
    if (absTick & 0x20) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n
    if (absTick & 0x40) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n
    if (absTick & 0x80) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n
    if (absTick & 0x100) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n
    if (absTick & 0x200) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n
    if (absTick & 0x400) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n
    if (absTick & 0x800) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n
    if (absTick & 0x1000) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n
    if (absTick & 0x2000) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n
    if (absTick & 0x4000) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n
    if (absTick & 0x8000) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n
    if (absTick & 0x10000) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n
    if (absTick & 0x20000) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n
    if (absTick & 0x40000) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n
    if (absTick & 0x80000) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n

    if (tick > 0) {
        ratio = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn / ratio
    }

    const sqrtPriceX96 = (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n)
    return sqrtPriceX96
}

export function sqrtPriceX96ToTick(sqrtPriceX96: bigint): number {
    const ratio = sqrtPriceX96 << 32n

    let msb = 0n
    let r = ratio
    if (r >= 0x100000000000000000000000000000000n) {
        r >>= 128n
        msb += 128n
    }
    if (r >= 0x10000000000000000n) {
        r >>= 64n
        msb += 64n
    }
    if (r >= 0x100000000n) {
        r >>= 32n
        msb += 32n
    }
    if (r >= 0x10000n) {
        r >>= 16n
        msb += 16n
    }
    if (r >= 0x100n) {
        r >>= 8n
        msb += 8n
    }
    if (r >= 0x10n) {
        r >>= 4n
        msb += 4n
    }
    if (r >= 0x4n) {
        r >>= 2n
        msb += 2n
    }
    if (r >= 0x2n) {
        msb += 1n
    }

    r = msb >= 128n ? ratio >> (msb - 127n) : ratio << (127n - msb)

    let log2 = (msb - 128n) << 64n

    for (let i = 63n; i >= 50n; i--) {
        r = (r * r) >> 127n
        const f = r >> 128n
        log2 |= f << i
        r >>= f
    }

    const log_sqrt10001 = log2 * 255738958999603826347141n
    const tickLow = Number((log_sqrt10001 - 3402992956809132418596140100660247210n) >> 128n)
    const tickHigh = Number((log_sqrt10001 + 291339464771989622907027621153398088495n) >> 128n)

    if (tickLow === tickHigh) {
        return tickLow
    }

    return tickToSqrtPriceX96(tickHigh) <= sqrtPriceX96 ? tickHigh : tickLow
}

export function priceToTick(price: string, decimals0: number, decimals1: number): number {
    const priceNum = parseFloat(price)
    if (priceNum <= 0) return MIN_TICK

    const adjustedPrice = priceNum * Math.pow(10, decimals1 - decimals0)

    const tick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001))
    return Math.max(MIN_TICK, Math.min(MAX_TICK, tick))
}

export function priceToSqrtPriceX96(price: string, decimals0: number, decimals1: number): bigint {
    const priceNum = parseFloat(price)
    if (priceNum <= 0) return MIN_SQRT_RATIO

    const adjustedPrice = priceNum * Math.pow(10, decimals1 - decimals0)
    const sqrtPrice = Math.sqrt(adjustedPrice)

    const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * Number(Q96)))
    return sqrtPriceX96
}

export function nearestUsableTick(tick: number, tickSpacing: number): number {
    const rounded = Math.round(tick / tickSpacing) * tickSpacing
    if (rounded < MIN_TICK) return MIN_TICK + (tickSpacing - (MIN_TICK % tickSpacing))
    if (rounded > MAX_TICK) return MAX_TICK - (MAX_TICK % tickSpacing)
    return rounded
}

export function isInRange(currentTick: number, tickLower: number, tickUpper: number): boolean {
    return currentTick >= tickLower && currentTick < tickUpper
}

export function sortTokens<T extends { address: string }>(tokenA: T, tokenB: T): [T, T] {
    const addressA = tokenA.address.toLowerCase()
    const addressB = tokenB.address.toLowerCase()
    return addressA < addressB ? [tokenA, tokenB] : [tokenB, tokenA]
}

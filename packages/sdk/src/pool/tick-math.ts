const MAX_TICK = 887272
const MIN_TICK = -MAX_TICK
const MIN_SQRT_RATIO = 4295128739n

const TICK_MULTIPLIERS = [
    0xfffcb933bd6fad37aa2d162d1a594001n,
    0xfff97272373d413259a46990580e213an,
    0xfff2e50f5f656932ef12357cf3c7fdccn,
    0xffe5caca7e10e4e61c3624eaa0941cd0n,
    0xffcb9843d60f6159c9db58835c926644n,
    0xff973b41fa98c081472e6896dfb254c0n,
    0xff2ea16466c96a3843ec78b326b52861n,
    0xfe5dee046a99a2a811c461f1969c3053n,
    0xfcbe86c7900a88aedcffc83b479aa3a4n,
    0xf987a7253ac413176f2b074cf7815e54n,
    0xf3392b0822b70005940c7a398e4b70f3n,
    0xe7159475a2c29b7443b29c7fa6e889d9n,
    0xd097f3bdfd2022b8845ad8f792aa5825n,
    0xa9f746462d870fdf8a65dc1f90e061e5n,
    0x70d869a156d2a1b890bb3df62baf32f7n,
    0x31be135f97d08fd981231505542fcfa6n,
    0x9aa508b5b7a84e1c677de54f3e99bc9n,
    0x5d6af8dedb81196699c329225ee604n,
    0x2216e584f5fa1ea926041bedfe98n,
    0x48a170391f7dc42444e8fa2n,
]

export function tickToSqrtPriceX96(tick: number): bigint {
    const absTick = Math.abs(tick)
    let ratio = 1n << 128n
    for (let i = 0; i < TICK_MULTIPLIERS.length; i++) {
        if (absTick & (1 << i)) ratio = (ratio * TICK_MULTIPLIERS[i]!) >> 128n
    }
    if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio
    return (ratio + 0xffffffffn) >> 32n
}

export function priceToSqrtPriceX96(price: number, decimals0: number, decimals1: number): bigint {
    if (price <= 0) return MIN_SQRT_RATIO
    return BigInt(Math.floor(Math.sqrt(price * 10 ** (decimals1 - decimals0)) * 2 ** 96))
}

function nearestUsableTick(tick: number, tickSpacing: number): number {
    const rounded = Math.round(tick / tickSpacing) * tickSpacing
    if (rounded < MIN_TICK) return MIN_TICK + (tickSpacing - (MIN_TICK % tickSpacing))
    if (rounded > MAX_TICK) return MAX_TICK - (MAX_TICK % tickSpacing)
    return rounded
}

export function snapTickRange(tickLower: number, tickUpper: number, tickSpacing: number) {
    const lower = nearestUsableTick(tickLower, tickSpacing)
    const upper = nearestUsableTick(tickUpper, tickSpacing)
    return { tickLower: lower, tickUpper: upper > lower ? upper : lower + tickSpacing }
}

export function sortTokens<T extends { address: string }>(tokenA: T, tokenB: T): [T, T] {
    return tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
        ? [tokenA, tokenB]
        : [tokenB, tokenA]
}

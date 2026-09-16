import type { CurveParams } from './launchpads/registry.js'

function feeFromNetAmountIn(netAmountIn: bigint, feeBps: bigint): bigint {
    if (netAmountIn <= 0n || feeBps <= 0n) return 0n
    return (netAmountIn * feeBps) / (10000n - feeBps)
}

export function creatorFeeShareForSwap(netAmountIn: bigint, curve: CurveParams): bigint {
    const fee = feeFromNetAmountIn(netAmountIn, BigInt(curve.feeBps))
    if (fee === 0n) return 0n
    return (fee * BigInt(curve.creatorShareBps)) / 10000n
}

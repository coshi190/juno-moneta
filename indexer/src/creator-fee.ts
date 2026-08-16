export const PUMP_FEE_BPS = 100n
export const CREATOR_FEE_SHARE_BPS = 5000n
export const VIRTUAL_AMOUNT = 3400n * 10n ** 18n

export function pumpFeeFromNetAmountIn(netAmountIn: bigint): bigint {
    if (netAmountIn <= 0n) return 0n
    return (netAmountIn * PUMP_FEE_BPS) / (10000n - PUMP_FEE_BPS)
}

export function creatorFeeShareForSwap(netAmountIn: bigint): bigint {
    const fee = pumpFeeFromNetAmountIn(netAmountIn)
    if (fee === 0n) return 0n
    return (fee * CREATOR_FEE_SHARE_BPS) / 10000n
}

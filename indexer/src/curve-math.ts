import type { CurveParams } from './launchpads/registry.js'

const WAD = 10n ** 18n

function effectiveNative(
    nativeReserve: bigint,
    tokenReserve: bigint,
    curve: CurveParams
): bigint | null {
    if (nativeReserve < 0n || tokenReserve <= 0n) return null
    return nativeReserve + curve.virtualReserve
}

export function computePriceFromReserves(
    nativeReserve: bigint,
    tokenReserve: bigint,
    curve: CurveParams
): number {
    const native = effectiveNative(nativeReserve, tokenReserve, curve)
    if (native === null) return 0
    return Number((native * WAD) / tokenReserve) / 1e18
}

export function computeMarketCapFromReserves(
    nativeReserve: bigint,
    tokenReserve: bigint,
    curve: CurveParams
): bigint {
    const native = effectiveNative(nativeReserve, tokenReserve, curve)
    if (native === null) return 0n
    return (native * curve.totalSupply) / tokenReserve
}

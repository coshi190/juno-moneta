export function isJunoswapProtocol(protocol: string): boolean {
    return protocol === 'junoswap'
}

export function computePoints(junoVolumeNative: number, externalVolumeNative: number): number {
    return Math.floor(junoVolumeNative / 50 + externalVolumeNative / 500)
}

export function computeReferralPoints(refereePoints: number[]): number {
    return Math.floor(refereePoints.reduce((sum, p) => sum + p, 0) * 0.1)
}

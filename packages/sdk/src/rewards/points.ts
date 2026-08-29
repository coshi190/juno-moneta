export function isJunoswapProtocol(protocol: string): boolean {
    return protocol === 'junoswap'
}

export function computePoints(junoVolumeNative: number, externalVolumeNative: number): number {
    return Math.floor(junoVolumeNative / 50 + externalVolumeNative / 500)
}

export interface UserStatVolumes {
    junoVolumeNative: number
    externalVolumeNative: number
}

export function userStatPoints(row: UserStatVolumes): number {
    return computePoints(row.junoVolumeNative, row.externalVolumeNative)
}

interface RefereeStat {
    user: string
    points: number
    volumeUsd: number
}

export interface ReferredTrader {
    address: string
    points: number
    volumeUsd: number
}

export interface ReferralRewardsResult {
    referralPoints: number
    refereeCount: number
    referees: ReferredTrader[]
}

export function computeReferralPoints(refereePoints: number[]): number {
    return Math.floor(refereePoints.reduce((sum, p) => sum + p, 0) * 0.1)
}

export function computeReferralRewards(
    referees: string[],
    stats: RefereeStat[]
): ReferralRewardsResult {
    const byAddr = new Map(stats.map((s) => [s.user.toLowerCase(), s]))
    const traders: ReferredTrader[] = referees.map((raw) => {
        const address = raw.toLowerCase()
        const s = byAddr.get(address)
        return {
            address,
            points: s?.points ?? 0,
            volumeUsd: s?.volumeUsd ?? 0,
        }
    })
    traders.sort((a, b) => b.points - a.points)
    return {
        referralPoints: computeReferralPoints(traders.map((r) => r.points)),
        refereeCount: traders.length,
        referees: traders,
    }
}

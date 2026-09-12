export interface UserStatVolumes {
    junoVolumeNative: number
    externalVolumeNative: number
}

export function computePoints(input: UserStatVolumes | number[]): number {
    if (Array.isArray(input)) {
        return Math.floor(input.reduce((sum, p) => sum + p, 0) * 0.1)
    }
    return Math.floor(input.junoVolumeNative / 50 + input.externalVolumeNative / 500)
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
        referralPoints: computePoints(traders.map((r) => r.points)),
        refereeCount: traders.length,
        referees: traders,
    }
}

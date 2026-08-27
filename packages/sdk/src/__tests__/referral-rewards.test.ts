import { describe, it, expect } from 'vitest'
import type { PonderClient } from '../ponder/client'
import { computeReferralPoints, computeReferralRewards } from '../rewards/points.js'
import { fetchReferralRewards } from '../ponder/queries/referrals.js'
import type { UserStatRow } from '../ponder/queries/user-stats'

describe('computeReferralPoints', () => {
    it('awards 10% of the summed referee points, floored once', () => {
        expect(computeReferralPoints([1200, 340])).toBe(154)
    })

    it('floors the aggregate, not per referee', () => {
        expect(computeReferralPoints([5, 5])).toBe(1)
        expect(computeReferralPoints([])).toBe(0)
    })
})

describe('computeReferralRewards', () => {
    it('ranks referees by points, prices volume, and takes the 10% cut', () => {
        const stats: UserStatRow[] = [
            {
                user: '0xBOB',
                volumeNative: 5000,
                junoVolumeNative: 5000,
                externalVolumeNative: 0,
                tradeCount: 1,
                buyCount: 1,
                sellCount: 0,
                points: 100,
                volumeUsd: 10000,
            },
            {
                user: '0xAMY',
                volumeNative: 5000,
                junoVolumeNative: 0,
                externalVolumeNative: 5000,
                tradeCount: 1,
                buyCount: 1,
                sellCount: 0,
                points: 10,
                volumeUsd: 10000,
            },
        ]
        const result = computeReferralRewards(['0xamy', '0xbob'], stats)
        expect(result.referees.map((r) => r.address)).toEqual(['0xbob', '0xamy'])
        expect(result.referees[0]).toMatchObject({ points: 100, volumeUsd: 10000 })
        expect(result.referees[1]).toMatchObject({ points: 10, volumeUsd: 10000 })
        expect(result.referralPoints).toBe(11)
    })

    it('matches referees case-insensitively and normalizes the address', () => {
        const result = computeReferralRewards(
            ['0xAmY'],
            [{ user: '0xamy', points: 40, volumeUsd: 900 }]
        )
        expect(result.referees).toEqual([{ address: '0xamy', points: 40, volumeUsd: 900 }])
        expect(result.referralPoints).toBe(4)
    })

    it('scores a referee with no folded row at zero', () => {
        const result = computeReferralRewards(['0xghost'], [])
        expect(result.referees).toEqual([{ address: '0xghost', points: 0, volumeUsd: 0 }])
        expect(result.referralPoints).toBe(0)
    })
})

function stubClient(rows: { bindings: unknown[]; stats: unknown[] }): PonderClient {
    return {
        request: async () => ({}) as never,
        fetchAllPages: async (query: string) => {
            if (query.includes('referralBindings')) return rows.bindings as never[]
            if (query.includes('userStats')) return rows.stats as never[]
            return [] as never[]
        },
    }
}

describe('fetchReferralRewards', () => {
    it('returns an empty result when the referrer has no referees', async () => {
        const client = stubClient({ bindings: [], stats: [] })
        const result = await fetchReferralRewards(client, {
            chainId: 96,
            referrer: '0xReferrer',
            nativeUsdPrice: 2,
        })
        expect(result).toEqual({ referralPoints: 0, refereeCount: 0, referees: [] })
    })

    it("scores a referee's two volume columns end-to-end", async () => {
        const client = stubClient({
            bindings: [{ referee: '0xRef1' }],
            stats: [
                {
                    user: '0xRef1',
                    volumeNative: 10000,
                    junoVolumeNative: 5000,
                    externalVolumeNative: 5000,
                    tradeCount: 1,
                    buyCount: 1,
                    sellCount: 0,
                },
            ],
        })
        const result = await fetchReferralRewards(client, {
            chainId: 96,
            referrer: '0xReferrer',
            nativeUsdPrice: 2,
        })
        expect(result.refereeCount).toBe(1)
        expect(result.referees[0]).toMatchObject({
            address: '0xref1',
            points: 110,
            volumeUsd: 20000,
        })
        expect(result.referralPoints).toBe(11)
    })
})

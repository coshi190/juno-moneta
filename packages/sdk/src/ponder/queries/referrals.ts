import type { PonderClient } from '../client.js'
import type { ReferralBinding } from '../entities.js'
import { computeReferralRewards, type ReferralRewardsResult } from '../../rewards/points.js'
import { sel, type Page, type Row } from './internal.js'
import { fetchUserStats } from './user-stats.js'

export type { ReferralRewardsResult, ReferredTrader } from '../../rewards/points.js'

const BINDING_FIELDS = ['referee', 'referrer'] as const satisfies readonly (keyof ReferralBinding)[]

export type Binding = Row<ReferralBinding, typeof BINDING_FIELDS>

export function fetchAllReferralBindings(client: PonderClient): Promise<Binding[]> {
    return client.fetchAllPages<{ referralBindings: Page<Binding> }, Binding>(
        `query AllReferralBindings($after: String) {
            referralBindings(
                orderBy: "boundAtTimestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(BINDING_FIELDS)} }
            }
        }`,
        {},
        (r) => r.referralBindings
    )
}

export function fetchReferralBindings(
    client: PonderClient,
    { referrer }: { referrer: string }
): Promise<Array<Pick<ReferralBinding, 'referee'>>> {
    return client.fetchAllPages<
        { referralBindings: Page<Pick<ReferralBinding, 'referee'>> },
        Pick<ReferralBinding, 'referee'>
    >(
        `query ReferralBindings($referrer: String!, $after: String) {
            referralBindings(
                where: { referrer: $referrer }
                orderBy: "boundAtTimestamp"
                orderDirection: "asc"
                limit: 1000
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { referee }
            }
        }`,
        { referrer },
        (r) => r.referralBindings
    )
}

export interface ReferralRewardsArgs {
    chainId: number
    referrer: string
    nativeUsdPrice: number | null
}

export async function fetchReferralRewards(
    client: PonderClient,
    { chainId, referrer, nativeUsdPrice }: ReferralRewardsArgs
): Promise<ReferralRewardsResult> {
    const bindings = await fetchReferralBindings(client, { referrer: referrer.toLowerCase() })
    const referees = bindings.map((r) => r.referee.toLowerCase())
    if (referees.length === 0) return computeReferralRewards([], [])
    const stats = await fetchUserStats(client, { chainId, users: referees, nativeUsdPrice })
    return computeReferralRewards(referees, stats)
}

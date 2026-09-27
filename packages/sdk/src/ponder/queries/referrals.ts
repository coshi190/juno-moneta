import type { PonderClient } from '../client.js'
import type { ReferralBinding } from '../entities.js'
import { computeReferralRewards, type ReferralRewardsResult } from '../../rewards/points.js'
import { MAX_LIMIT, sel, type Page, type Row } from './internal.js'
import { fetchUserStats } from './user-stats.js'

const BINDING_FIELDS = ['referee', 'referrer'] as const satisfies readonly (keyof ReferralBinding)[]

type Binding = Row<ReferralBinding, typeof BINDING_FIELDS>

export function fetchReferralBindings(
    client: PonderClient,
    { referrer }: { referrer?: string } = {}
): Promise<Binding[]> {
    return client.fetchAllPages<{ referralBindings: Page<Binding> }, Binding>(
        `query ReferralBindings($where: referralBindingFilter, $after: String) {
            referralBindings(
                where: $where
                orderBy: "boundAtTimestamp"
                orderDirection: "asc"
                limit: ${MAX_LIMIT}
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(BINDING_FIELDS)} }
            }
        }`,
        { where: { referrer: referrer?.toLowerCase() } },
        (r) => r.referralBindings
    )
}

export async function fetchReferralRewards(
    client: PonderClient,
    { chainId, referrer }: { chainId: number; referrer: string }
): Promise<ReferralRewardsResult> {
    const bindings = await fetchReferralBindings(client, { referrer })
    const referees = bindings.map((b) => b.referee.toLowerCase())
    const stats = referees.length ? await fetchUserStats(client, { chainId, users: referees }) : []
    return computeReferralRewards(referees, stats)
}

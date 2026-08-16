import type { PonderClient } from '../client.js'
import type { ReferralBinding } from '../entities.js'
import { sel, type Page, type Row } from './internal.js'

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

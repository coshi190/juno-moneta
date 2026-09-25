import type * as sdk from '@coshi190/juno-moneta-sdk'
import { GraphQLClient } from 'graphql-request'

export type PonderClient = Parameters<typeof sdk.fetchIndexerStatus>[0]

const REQUEST_TIMEOUT_MS = 5_000

export function createPonderClient(url: string): PonderClient {
    const client = new GraphQLClient(url)
    const request: PonderClient['request'] = (document, variables) =>
        client.request({ document, variables, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

    return {
        request,
        async fetchAllPages(query, variables, select) {
            const items = []
            for (let after: string | null = null; ;) {
                const { pageInfo, items: page } = select(
                    await request(query, { ...variables, after })
                )
                items.push(...page)
                if (!pageInfo.hasNextPage || !pageInfo.endCursor) return items
                after = pageInfo.endCursor
            }
        },
    }
}

import { GraphQLClient } from 'graphql-request'

const REQUEST_TIMEOUT_MS = 5_000

export interface PonderPageInfo {
    hasNextPage: boolean
    endCursor: string | null
}

export interface PonderClient {
    request<T>(query: string, variables?: Record<string, unknown>): Promise<T>
    fetchAllPages<TResponse, TItem>(
        query: string,
        variables: Record<string, unknown>,
        select: (r: TResponse) => { pageInfo: PonderPageInfo; items: TItem[] }
    ): Promise<TItem[]>
}

export function createPonderClient(url: string): PonderClient {
    const client = new GraphQLClient(url)

    const request = <T>(query: string, variables?: Record<string, unknown>): Promise<T> =>
        client.request<T>({
            document: query,
            variables,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

    return {
        request,
        async fetchAllPages<TResponse, TItem>(
            query: string,
            variables: Record<string, unknown>,
            select: (r: TResponse) => { pageInfo: PonderPageInfo; items: TItem[] }
        ): Promise<TItem[]> {
            const items: TItem[] = []
            let after: string | null = null
            for (;;) {
                const result = await request<TResponse>(query, { ...variables, after })
                const conn = select(result)
                items.push(...conn.items)
                if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
                after = conn.pageInfo.endCursor
            }
            return items
        },
    }
}

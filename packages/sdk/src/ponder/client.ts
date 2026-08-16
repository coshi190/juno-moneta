import { GraphQLClient, ClientError } from 'graphql-request'

const REQUEST_TIMEOUT_MS = 5_000
const FAILURES_BEFORE_OPEN = 3
const CIRCUIT_OPEN_MS = 30_000

export function isPonderError(error: unknown): boolean {
    if (error instanceof ClientError) return true
    return error instanceof Error
}

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

export function createPonderClient(url: string | (() => string)): PonderClient {
    let client: GraphQLClient | null = null
    let consecutiveFailures = 0
    let circuitOpenUntil = 0

    const getClient = () => {
        if (!client) client = new GraphQLClient(typeof url === 'function' ? url() : url)
        return client
    }

    const request = <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
        if (Date.now() < circuitOpenUntil) {
            throw new Error('Ponder circuit breaker open')
        }

        return getClient()
            .request<T>({
                document: query,
                variables,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
            .then(
                (result) => {
                    consecutiveFailures = 0
                    return result
                },
                (error) => {
                    if (isPonderError(error)) {
                        consecutiveFailures++
                        if (consecutiveFailures >= FAILURES_BEFORE_OPEN) {
                            circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS
                        }
                    }
                    throw error
                }
            )
    }

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

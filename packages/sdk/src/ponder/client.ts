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

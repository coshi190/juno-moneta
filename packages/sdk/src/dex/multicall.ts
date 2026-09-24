import type { ContractCall } from './plan-swap.js'

export type ReadResult<T = unknown> =
    { status: 'success'; result: T } | { status: 'failure'; error: Error }

export interface ReadClient {
    multicall(args: { contracts: readonly ContractCall[]; allowFailure: true }): Promise<unknown>
    readContract(args: ContractCall): Promise<unknown>
}

export async function batchRead(
    client: ReadClient,
    calls: readonly ContractCall[]
): Promise<ReadResult[]> {
    if (calls.length === 0) return []

    try {
        const results = await client.multicall({ contracts: calls, allowFailure: true })
        return results as ReadResult[]
    } catch {
        const settled = await Promise.allSettled(calls.map((call) => client.readContract(call)))
        return settled.map((outcome) =>
            outcome.status === 'fulfilled'
                ? { status: 'success', result: outcome.value }
                : { status: 'failure', error: outcome.reason as Error }
        )
    }
}

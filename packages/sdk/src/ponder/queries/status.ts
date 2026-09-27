import type { PonderClient } from '../client.js'

type Block = { number: number; timestamp: number }

export type IndexerStatus = Record<string, { id: number; block: Block; lagSeconds: number }>

export async function fetchIndexerStatus(client: PonderClient): Promise<IndexerStatus> {
    const { _meta } = await client.request<{
        _meta: { status: Record<string, { id: number; block: Block | null } | null> | null } | null
    }>(`query IndexerStatus { _meta { status } }`)
    const now = Math.floor(Date.now() / 1000)
    return Object.fromEntries(
        Object.entries(_meta?.status ?? {}).flatMap(([name, chain]) => {
            if (!chain?.block) return []
            const lagSeconds = Math.max(0, now - chain.block.timestamp)
            return [[name, { id: chain.id, block: chain.block, lagSeconds }]]
        })
    )
}

import type { PonderClient } from '../client.js'

export interface IndexerBlock {
    number: number
    timestamp: number
}

export interface IndexerChainStatus {
    id: number
    block: IndexerBlock
    lagSeconds: number
}

export type IndexerStatus = Record<string, IndexerChainStatus>

interface MetaChainStatus {
    id: number
    block: IndexerBlock | null
}

interface MetaResponse {
    _meta: { status: Record<string, MetaChainStatus | null> | null } | null
}

export async function fetchIndexerStatus(client: PonderClient): Promise<IndexerStatus> {
    const result = await client.request<MetaResponse>(`query IndexerStatus { _meta { status } }`)

    const status = result._meta?.status
    if (!status) return {}

    const now = Math.floor(Date.now() / 1000)
    const chains: IndexerStatus = {}
    for (const [chainName, chain] of Object.entries(status)) {
        if (!chain?.block) continue
        chains[chainName] = {
            id: chain.id,
            block: chain.block,
            lagSeconds: Math.max(0, now - chain.block.timestamp),
        }
    }
    return chains
}

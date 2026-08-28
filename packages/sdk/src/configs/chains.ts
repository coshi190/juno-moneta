import type { Address } from 'viem'
import chains from './data/chains.json' with { type: 'json' }

const CHAIN_IDS = chains.ids

export type ChainSlug = keyof typeof CHAIN_IDS

export function getChains(): Readonly<Record<ChainSlug, number>> {
    return CHAIN_IDS
}

export function byChainId<T, R>(
    table: Record<string, T>,
    map: (value: T, chainId: number) => R
): Record<number, R> {
    const result: Record<number, R> = {}
    for (const [slug, value] of Object.entries(table)) {
        const chainId = CHAIN_IDS[slug as ChainSlug] as number | undefined
        if (chainId === undefined) throw new Error(`unknown chain slug "${slug}"`)
        result[chainId] = map(value, chainId)
    }
    return result
}

const WRAPPED_NATIVE_ADDRESSES: Record<number, Address> = byChainId(
    chains.wrappedNative,
    (address) => address as Address
)

const STABLECOIN_ADDRESSES: Record<number, ReadonlySet<string>> = byChainId(
    chains.stablecoins as Record<string, string[]>,
    (addresses) => new Set(addresses)
)

export function getWrappedNativeAddress(chainId: number): Address | undefined {
    return WRAPPED_NATIVE_ADDRESSES[chainId]
}

export function getStablecoins(chainId: number): ReadonlySet<string> | undefined {
    return STABLECOIN_ADDRESSES[chainId]
}

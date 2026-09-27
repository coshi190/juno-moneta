import type { Address } from 'viem'
import { byChainId } from './chains.js'
import dexRegistry from './data/dex-registry.json' with { type: 'json' }

export type DEXType = string

export type Protocol = 'v2' | 'v3'

export interface V2Dex {
    dexId: DEXType
    protocol: 'v2'
    factory: Address
    router: Address
    wnative?: Address
}

export interface V3Dex {
    dexId: DEXType
    protocol: 'v3'
    factory: Address
    quoter: Address
    swapRouter: Address
    positionManager?: Address
    staker?: Address
    feeTiers: number[]
}

export type Dex = V2Dex | V3Dex

type DexOf<P extends Protocol> = Extract<Dex, { protocol: P }>

type RawDexRegistry = Record<
    string,
    { protocols: Record<string, Record<string, { enabled?: boolean } & Record<string, unknown>>> }
>

const DEXES_BY_CHAIN: Record<number, Dex[]> = (() => {
    const byChain: Record<number, Dex[]> = {}
    for (const [dexId, dex] of Object.entries(dexRegistry as RawDexRegistry)) {
        const perChain = byChainId(dex.protocols, (byProtocol) => byProtocol)
        for (const [chainId, byProtocol] of Object.entries(perChain)) {
            for (const [protocol, { enabled, ...rest }] of Object.entries(byProtocol)) {
                if (!enabled) continue
                ;(byChain[Number(chainId)] ??= []).push({ ...rest, dexId, protocol } as Dex)
            }
        }
    }
    return byChain
})()

export function getDexes<P extends Protocol = Protocol>(chainId: number, protocol?: P): DexOf<P>[] {
    const dexes = DEXES_BY_CHAIN[chainId] ?? []
    return (
        protocol === undefined ? dexes : dexes.filter((dex) => dex.protocol === protocol)
    ) as DexOf<P>[]
}

export function findDex<P extends Protocol>(
    chainId: number,
    dexId: DEXType | undefined,
    protocol: P
): DexOf<P> | undefined {
    return DEXES_BY_CHAIN[chainId]?.find(
        (dex) => dex.protocol === protocol && (dexId === undefined || dex.dexId === dexId)
    ) as DexOf<P> | undefined
}

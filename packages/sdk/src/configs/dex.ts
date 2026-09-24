import type { Address } from 'viem'
import { byChainId } from './chains.js'
import dexRegistry from './data/dex-registry.json' with { type: 'json' }

export type DEXType = string

export type Protocol = 'v2' | 'v3'

interface DexBase {
    dexId: DEXType
}

export interface V2Dex extends DexBase {
    protocol: 'v2'
    factory: Address
    router: Address
    wnative?: Address
}

export interface V3Dex extends DexBase {
    protocol: 'v3'
    factory: Address
    quoter: Address
    swapRouter: Address
    positionManager?: Address
    staker?: Address
    feeTiers: number[]
}

export type Dex = V2Dex | V3Dex

interface RawDexRegistry {
    [dexId: string]: {
        protocols: Record<string, Record<string, Record<string, unknown>>>
    }
}

const DEXES_BY_CHAIN: Record<number, Dex[]> = (() => {
    const byChain: Record<number, Dex[]> = {}
    for (const [dexId, dex] of Object.entries(dexRegistry as RawDexRegistry)) {
        const perChain = byChainId(dex.protocols, (byProtocol) => byProtocol)
        for (const [chainId, byProtocol] of Object.entries(perChain)) {
            for (const [protocol, cfg] of Object.entries(byProtocol)) {
                if (!cfg.enabled) continue
                const { enabled: _enabled, ...rest } = cfg
                const entry = { ...rest, dexId, protocol } as Dex
                ;(byChain[Number(chainId)] ??= []).push(entry)
            }
        }
    }
    return byChain
})()

export function getDexes(chainId: number, protocol: 'v2'): V2Dex[]
export function getDexes(chainId: number, protocol: 'v3'): V3Dex[]
export function getDexes(chainId: number, protocol?: Protocol): Dex[]
export function getDexes(chainId: number, protocol?: Protocol): Dex[] {
    const dexes = DEXES_BY_CHAIN[chainId] ?? []
    return protocol === undefined ? dexes : dexes.filter((dex) => dex.protocol === protocol)
}

export function findDex(
    chainId: number,
    dexId: DEXType | undefined,
    protocol: 'v2'
): V2Dex | undefined
export function findDex(
    chainId: number,
    dexId: DEXType | undefined,
    protocol: 'v3'
): V3Dex | undefined
export function findDex(
    chainId: number,
    dexId: DEXType | undefined,
    protocol: Protocol
): Dex | undefined
export function findDex(
    chainId: number,
    dexId: DEXType | undefined,
    protocol: Protocol
): Dex | undefined {
    const dexes = getDexes(chainId, protocol)
    return dexId === undefined ? dexes[0] : dexes.find((dex) => dex.dexId === dexId)
}

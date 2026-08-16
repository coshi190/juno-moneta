import type { Address } from 'viem'
import { byChainId, CHAIN_IDS } from './chains.js'
import dexRegistry from './data/dex-registry.json' with { type: 'json' }

export type DEXType = 'junoswap' | 'uniswap' | 'pancakeswap' | string

export enum ProtocolType {
    V2 = 'v2',
    V3 = 'v3',
}

interface BaseProtocolConfig {
    protocolType: ProtocolType
    chainId: number
    enabled: boolean
}

export interface V2Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V2
    factory: Address
    router: Address
    wnative?: Address
}

export interface V3Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V3
    factory: Address
    quoter: Address
    swapRouter: Address
    positionManager?: Address
    staker?: Address
    feeTiers?: number[]
    defaultFeeTier?: number
}

export type ProtocolConfig = V2Config | V3Config

export interface DEXConfiguration {
    dexId: DEXType
    defaultProtocol: ProtocolType
    priority?: number
    protocols: Record<number, Partial<Record<ProtocolType, ProtocolConfig>>>
}

export interface RawDexRegistry {
    [dexId: string]: {
        defaultProtocol: string
        priority?: number
        protocols: Record<string, Record<string, Record<string, unknown>>>
    }
}

export const FEE_TIERS = {
    STABLE: 100,
    LOW: 500,
    MEDIUM: 3000,
    HIGH: 10000,
} as const

export const DEFAULT_FEE_TIER = FEE_TIERS.MEDIUM

const DEX_CONFIGS_REGISTRY = Object.fromEntries(
    Object.entries(dexRegistry as RawDexRegistry).map(([dexId, dex]) => {
        const protocols = byChainId(dex.protocols, (byProtocol, chainId) => {
            const entry: Partial<Record<ProtocolType, ProtocolConfig>> = {}
            for (const [proto, cfg] of Object.entries(byProtocol)) {
                entry[proto as ProtocolType] = {
                    ...cfg,
                    protocolType: proto as ProtocolType,
                    chainId,
                } as ProtocolConfig
            }
            return entry
        })
        return [
            dexId,
            {
                dexId: dexId as DEXType,
                defaultProtocol: dex.defaultProtocol as ProtocolType,
                priority: dex.priority,
                protocols,
            },
        ]
    })
) as Record<DEXType, DEXConfiguration>

export function getV3Config(chainId: number, dexId?: DEXType): V3Config | undefined {
    const dexConfig = DEX_CONFIGS_REGISTRY[dexId || 'junoswap']
    if (!dexConfig) return undefined

    const config = dexConfig.protocols[chainId]?.[ProtocolType.V3]
    return config?.protocolType === ProtocolType.V3 && config.enabled ? config : undefined
}

export function getV2Config(chainId: number, dexId?: DEXType): V2Config | undefined {
    const dexConfig = DEX_CONFIGS_REGISTRY[dexId || 'junoswap']
    if (!dexConfig) return undefined

    const config = dexConfig.protocols[chainId]?.[ProtocolType.V2]
    return config?.protocolType === ProtocolType.V2 && config.enabled ? config : undefined
}

export function getV3StakerAddress(chainId: number, dexId?: DEXType): Address | undefined {
    return getV3Config(chainId, dexId)?.staker
}

export function getDexConfig(chainId: number, dexId?: DEXType): ProtocolConfig | undefined {
    const dexConfig = DEX_CONFIGS_REGISTRY[dexId || 'junoswap']
    if (!dexConfig) return undefined

    return dexConfig.protocols[chainId]?.[dexConfig.defaultProtocol]
}

function byPriority(a: DEXType, b: DEXType): number {
    return (DEX_CONFIGS_REGISTRY[a]?.priority ?? 999) - (DEX_CONFIGS_REGISTRY[b]?.priority ?? 999)
}

export function getDexsByProtocol(chainId: number, protocolType: ProtocolType): DEXType[] {
    return Object.entries(DEX_CONFIGS_REGISTRY)
        .filter(([, dexConfig]) => dexConfig.protocols[chainId]?.[protocolType]?.enabled ?? false)
        .map(([dexId]) => dexId as DEXType)
        .sort(byPriority)
}

export function getSupportedDexs(chainId: number): DEXType[] {
    return Object.entries(DEX_CONFIGS_REGISTRY)
        .filter(([, dexConfig]) => {
            const chainProtocols = dexConfig.protocols[chainId]
            if (!chainProtocols) return false
            return Object.values(chainProtocols).some((protocol) => protocol.enabled)
        })
        .map(([dexId]) => dexId as DEXType)
        .sort(byPriority)
}

export function isV2Config(config: ProtocolConfig): config is V2Config {
    return config.protocolType === ProtocolType.V2
}

export function isV3Config(config: ProtocolConfig): config is V3Config {
    return config.protocolType === ProtocolType.V3
}

export function getProtocolSpender(config: ProtocolConfig): Address | undefined {
    switch (config.protocolType) {
        case ProtocolType.V2:
            return config.router
        case ProtocolType.V3:
            return config.swapRouter
        default:
            return undefined
    }
}

export function getDefaultDexForChain(chainId: number): DEXType {
    if (chainId === CHAIN_IDS.bsc) return 'pancakeswap'
    if (chainId === CHAIN_IDS.worldchain || chainId === CHAIN_IDS.base) return 'uniswap'
    return 'junoswap'
}

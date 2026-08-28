import type { Address } from 'viem'
import { byChainId } from './chains.js'
import dexRegistry from './data/dex-registry.json' with { type: 'json' }

export type DEXType = string

const DEFAULT_DEX_ID = 'junoswap'

export enum ProtocolType {
    V2 = 'v2',
    V3 = 'v3',
}

interface BaseProtocolConfig {
    protocolType: ProtocolType
    chainId: number
    enabled: boolean
}

interface V2Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V2
    factory: Address
    router: Address
    wnative?: Address
}

interface V3Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V3
    factory: Address
    quoter: Address
    swapRouter: Address
    positionManager?: Address
    staker?: Address
    feeTiers: number[]
    defaultFeeTier?: number
}

type ProtocolConfig = V2Config | V3Config

interface DEXConfiguration {
    dexId: DEXType
    defaultProtocol: ProtocolType
    protocols: Record<number, Partial<Record<ProtocolType, ProtocolConfig>>>
}

interface RawDexRegistry {
    [dexId: string]: {
        defaultProtocol: string
        protocols: Record<string, Record<string, Record<string, unknown>>>
    }
}

const DEFAULT_TICK_SPACING = 60

const TICK_SPACING_BY_FEE: Record<number, number> = {
    100: 1,
    500: 10,
    2500: 50,
    3000: 60,
    10000: 200,
}

export function getTickSpacing(fee: number): number {
    return TICK_SPACING_BY_FEE[fee] ?? DEFAULT_TICK_SPACING
}

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
                protocols,
            },
        ]
    })
) as Record<DEXType, DEXConfiguration>

export function getDexConfig(
    chainId: number,
    dexId: DEXType | undefined,
    protocol: ProtocolType.V2
): V2Config | undefined
export function getDexConfig(
    chainId: number,
    dexId: DEXType | undefined,
    protocol: ProtocolType.V3
): V3Config | undefined
export function getDexConfig(
    chainId: number,
    dexId?: DEXType,
    protocol?: ProtocolType
): ProtocolConfig | undefined
export function getDexConfig(
    chainId: number,
    dexId?: DEXType,
    protocol?: ProtocolType
): ProtocolConfig | undefined {
    const dex = DEX_CONFIGS_REGISTRY[dexId || DEFAULT_DEX_ID]
    const config = dex?.protocols[chainId]?.[protocol ?? dex.defaultProtocol]
    if (!config) return undefined
    if (protocol === undefined) return config
    return config.protocolType === protocol && config.enabled ? config : undefined
}

export function getSupportedDexs(chainId: number, protocol?: ProtocolType): DEXType[] {
    return Object.entries(DEX_CONFIGS_REGISTRY)
        .filter(([, dex]) => {
            const byProtocol = dex.protocols[chainId] ?? {}
            return protocol === undefined
                ? Object.values(byProtocol).some((p) => p.enabled)
                : (byProtocol[protocol]?.enabled ?? false)
        })
        .map(([dexId]) => dexId as DEXType)
}

import {
    CHAIN_IDS,
    ProtocolType,
    getDexConfig,
    getV2Config,
    getV3Config,
    type DEXType,
    type ProtocolConfig,
} from '@coshi190/junoswap-sdk'

export class UsageError extends Error {}

export const CHAIN_SLUGS = Object.keys(CHAIN_IDS)

export function parseChainId(value: string | undefined): number {
    if (value === undefined) throw new UsageError('missing required flag --chainId')
    if (/^\d+$/.test(value)) return Number(value)

    const chainId = (CHAIN_IDS as Record<string, number | undefined>)[value]
    if (chainId === undefined) {
        throw new UsageError(
            `unknown chain "${value}" (expected a numeric id or one of: ${CHAIN_SLUGS.join(', ')})`
        )
    }
    return chainId
}

export function parseProtocolType(value: string | undefined): ProtocolType {
    if (value === undefined) throw new UsageError('missing required flag --protocolType')
    if (value === 'v2') return ProtocolType.V2
    if (value === 'v3') return ProtocolType.V3
    throw new UsageError(`unknown protocol "${value}" (expected v2 or v3)`)
}

export function optionalProtocolType(value: string | undefined): ProtocolType | undefined {
    return value === undefined ? undefined : parseProtocolType(value)
}

export function resolveProtocolConfig(
    chainId: number,
    dexId: DEXType | undefined,
    protocolType: ProtocolType | undefined
): ProtocolConfig {
    let config: ProtocolConfig | undefined
    if (protocolType === ProtocolType.V2) config = getV2Config(chainId, dexId)
    else if (protocolType === ProtocolType.V3) config = getV3Config(chainId, dexId)
    else config = getDexConfig(chainId, dexId)

    if (!config) {
        throw new UsageError(
            `no ${protocolType ?? 'default'} config for dex "${dexId ?? 'junoswap'}" on chain ${chainId}`
        )
    }
    return config
}

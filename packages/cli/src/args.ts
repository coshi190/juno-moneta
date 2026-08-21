import {
    CHAIN_IDS,
    ProtocolType,
    WRAPPED_NATIVE_ADDRESSES,
    getDexConfig,
    getV2Config,
    getV3Config,
    type DEXType,
    type ProtocolConfig,
} from '@coshi190/junoswap-sdk'

export class UsageError extends Error {}

export const CHAIN_SLUGS = Object.keys(CHAIN_IDS)

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

function normalizeAddress(item: string): string {
    if (!ADDRESS.test(item)) {
        throw new UsageError(`invalid address "${item}" (expected 0x + 40 hex chars)`)
    }
    return item.toLowerCase()
}

export function parseAddress(value: string | undefined, flag: string): string {
    if (value === undefined) throw new UsageError(`missing required flag --${flag}`)
    return normalizeAddress(value.trim())
}

export function parseAddressList(value: string | undefined, flag: string): string[] {
    if (value === undefined) throw new UsageError(`missing required flag --${flag}`)
    const items = value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    if (items.length === 0) throw new UsageError(`--${flag} requires at least one address`)
    return items.map(normalizeAddress)
}

export function parsePonderUrl(value: string | undefined): string {
    const url = value ?? process.env.JUNOSWAP_PONDER_URL
    if (!url) {
        throw new UsageError(
            'missing indexer endpoint (pass --ponderUrl or set JUNOSWAP_PONDER_URL)'
        )
    }
    return url
}

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

export function optionalPositiveInt(value: string | undefined, flag: string): number | undefined {
    if (value === undefined) return undefined
    if (!/^\d+$/.test(value) || Number(value) === 0) {
        throw new UsageError(`invalid --${flag} "${value}" (expected a positive integer)`)
    }
    return Number(value)
}

export function optionalLimit(value: string | undefined): number | undefined {
    return optionalPositiveInt(value, 'limit')
}

export function optionalProtocol(value: string | undefined): string | undefined {
    if (value === undefined) return undefined
    const protocol = value.trim()
    if (protocol.length === 0) throw new UsageError('--protocol requires a name')
    return protocol
}

export function resolveWrappedNative(chainId: number, value: string | undefined): string {
    if (value !== undefined) return parseAddress(value, 'wrappedNative')
    const wrappedNative = WRAPPED_NATIVE_ADDRESSES[chainId]
    if (wrappedNative === undefined) {
        throw new UsageError(
            `no wrapped native address for chain ${chainId} (pass --wrappedNative)`
        )
    }
    return wrappedNative
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

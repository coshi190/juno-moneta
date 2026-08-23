import {
    CHAIN_IDS,
    ProtocolType,
    getDexConfig,
    getV2Config,
    getV3Config,
    type DEXType,
    type ProtocolConfig,
    type QueryOrder,
} from '@coshi190/juno-moneta-sdk'

export class UsageError extends Error {}

export const CHAIN_SLUGS = Object.keys(CHAIN_IDS)

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

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

export function optionalAddress(value: string | undefined): string | undefined {
    return value === undefined ? undefined : normalizeAddress(value.trim())
}

export function optionalAddressList(value: string | undefined): string[] | undefined {
    if (value === undefined) return undefined
    return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .map(normalizeAddress)
}

export function parseTokenIds(value: string | undefined): bigint[] {
    if (value === undefined) throw new UsageError('missing required flag --tokenIds')
    const items = value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    if (items.length === 0) throw new UsageError('--tokenIds requires at least one token id')
    return items.map((item) => {
        if (!/^\d+$/.test(item)) {
            throw new UsageError(`invalid token id "${item}" (expected a non-negative integer)`)
        }
        return BigInt(item)
    })
}

export function parsePonderUrl(value: string | undefined): string {
    const url = value ?? process.env.JUNO_MONETA_PONDER_URL ?? process.env.JUNOSWAP_PONDER_URL
    if (!url) {
        throw new UsageError(
            'missing indexer endpoint (pass --ponderUrl or set JUNO_MONETA_PONDER_URL)'
        )
    }
    return url
}

function resolveChainId(value: string): number {
    if (/^\d+$/.test(value)) return Number(value)

    const chainId = (CHAIN_IDS as Record<string, number | undefined>)[value]
    if (chainId === undefined) {
        throw new UsageError(
            `unknown chain "${value}" (expected a numeric id or one of: ${CHAIN_SLUGS.join(', ')})`
        )
    }
    return chainId
}

export function parseChainId(value: string | undefined): number {
    if (value === undefined) throw new UsageError('missing required flag --chainId')
    return resolveChainId(value)
}

export function optionalChainId(value: string | undefined): number | undefined {
    return value === undefined ? undefined : resolveChainId(value)
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

export function optionalGraduated(value: string | undefined): 0 | 1 | undefined {
    if (value === undefined) return undefined
    if (value === '0') return 0
    if (value === '1') return 1
    throw new UsageError(`invalid --isGraduated "${value}" (expected 0 or 1)`)
}

export function parseFields<TEntity>(
    value: string | undefined,
    presets: Record<string, readonly (keyof TEntity)[]>,
    fallback: readonly (keyof TEntity)[]
): readonly (keyof TEntity)[] {
    if (value === undefined) return fallback

    const preset = presets[value]
    if (preset !== undefined) return preset

    const names = value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    if (names.length === 0) {
        throw new UsageError(
            `--fields requires field names or one of: ${Object.keys(presets).join(', ')}`
        )
    }

    return names.map((name) => {
        if (!IDENTIFIER.test(name)) {
            throw new UsageError(`invalid field "${name}" (expected a plain field name)`)
        }
        return name as keyof TEntity
    })
}

export function optionalOrder<TEntity>(
    orderBy: string | undefined,
    orderDirection: string | undefined
): QueryOrder<TEntity> | undefined {
    if (orderBy === undefined) {
        if (orderDirection !== undefined) {
            throw new UsageError('--orderDirection requires --orderBy')
        }
        return undefined
    }
    if (!IDENTIFIER.test(orderBy)) {
        throw new UsageError(`invalid --orderBy "${orderBy}" (expected a plain field name)`)
    }
    if (orderDirection !== undefined && orderDirection !== 'asc' && orderDirection !== 'desc') {
        throw new UsageError(`invalid --orderDirection "${orderDirection}" (expected asc or desc)`)
    }
    return { orderBy: orderBy as keyof TEntity, orderDirection }
}

const CHAINS = {
    kubTestnet: 25925,
    bitkub: 96,
    jbc: 8899,
    bsc: 56,
    base: 8453,
    worldchain: 480,
} as const

type ChainSlug = keyof typeof CHAINS

export class UsageError extends Error {}

export const CHAIN_SLUGS = Object.keys(CHAINS) as ChainSlug[]

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function required(value: string | undefined, flag: string): string {
    if (value === undefined) throw new UsageError(`missing required flag --${flag}`)
    return value.trim()
}

function normalizeAddress(item: string): string {
    if (!ADDRESS.test(item)) {
        throw new UsageError(`invalid address "${item}" (expected 0x + 40 hex chars)`)
    }
    return item.toLowerCase()
}

function splitList(value: string): string[] {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
}

export function parseAddress(value: string | undefined, flag: string): string {
    return normalizeAddress(required(value, flag))
}

export function parseAddressList(value: string | undefined, flag: string): string[] {
    const items = splitList(required(value, flag))
    if (items.length === 0) throw new UsageError(`--${flag} requires at least one address`)
    return items.map(normalizeAddress)
}

export function optionalAddress(value: string | undefined): string | undefined {
    return value === undefined ? undefined : normalizeAddress(value.trim())
}

export function optionalAddressList(value: string | undefined): string[] | undefined {
    if (value === undefined) return undefined
    return splitList(value).map(normalizeAddress)
}

export function parseTokenIds(value: string | undefined): bigint[] {
    const items = splitList(required(value, 'tokenIds'))
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

    if (!(value in CHAINS)) {
        throw new UsageError(
            `unknown chain "${value}" (expected a numeric id or one of: ${CHAIN_SLUGS.join(', ')})`
        )
    }
    return CHAINS[value as ChainSlug]
}

export function parseChainId(value: string | undefined): number {
    return resolveChainId(required(value, 'chainId'))
}

export function optionalChainId(value: string | undefined): number | undefined {
    return value === undefined ? undefined : resolveChainId(value.trim())
}

function optionalUint(value: string | undefined, flag: string, min: 0 | 1): number | undefined {
    if (value === undefined) return undefined
    const text = value.trim()
    if (!/^\d+$/.test(text) || Number(text) < min) {
        const expected = min === 1 ? 'positive' : 'non-negative'
        throw new UsageError(`invalid --${flag} "${value}" (expected a ${expected} integer)`)
    }
    return Number(text)
}

export function optionalLimit(value: string | undefined): number | undefined {
    return optionalUint(value, 'limit', 1)
}

export function optionalNonNegativeInt(
    value: string | undefined,
    flag: string
): number | undefined {
    return optionalUint(value, flag, 0)
}

export function optionalName(value: string | undefined, flag: string): string | undefined {
    if (value === undefined) return undefined
    const name = value.trim()
    if (name.length === 0) throw new UsageError(`--${flag} requires a name`)
    return name
}

const RELATIVE = /^(\d+)([mhd])$/

export function parseTime(value: string | undefined, flag: string): number {
    const text = required(value, flag)

    const relative = RELATIVE.exec(text)
    if (relative) {
        const unit = relative[2]
        const seconds = Number(relative[1]) * (unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400)
        return Math.floor(Date.now() / 1000) - seconds
    }

    if (!/^\d+$/.test(text)) {
        throw new UsageError(
            `invalid --${flag} "${value}" (expected unix seconds or a span like 30m, 24h, 7d)`
        )
    }
    return Number(text)
}

export function parseEnum<T extends string>(
    value: string | undefined,
    flag: string,
    allowed: readonly T[]
): T {
    const choice = required(value, flag) as T
    if (!allowed.includes(choice)) {
        throw new UsageError(
            `invalid --${flag} "${value}" (expected one of: ${allowed.join(', ')})`
        )
    }
    return choice
}

export function parseInteger(value: string | undefined, flag: string): number {
    const text = required(value, flag)
    if (!/^-?\d+$/.test(text)) {
        throw new UsageError(`invalid --${flag} "${value}" (expected a whole number)`)
    }
    return Number(text)
}

export function optionalNumber(value: string | undefined, flag: string): number | undefined {
    if (value === undefined) return undefined
    const text = value.trim()
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
        throw new UsageError(`invalid --${flag} "${value}" (expected a number)`)
    }
    return Number(text)
}

export function optionalFlag(value: string | undefined, flag: string): 0 | 1 | undefined {
    if (value === undefined) return undefined
    const text = value.trim()
    if (text === '0') return 0
    if (text === '1') return 1
    throw new UsageError(`invalid --${flag} "${value}" (expected 0 or 1)`)
}

export function parseFields<TEntity>(
    value: string | undefined,
    presets: Record<string, readonly (keyof TEntity)[]>,
    fallback: readonly (keyof TEntity)[]
): readonly (keyof TEntity)[] {
    if (value === undefined) return fallback

    const preset = presets[value]
    if (preset !== undefined) return preset

    const names = splitList(value)
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

interface QueryOrder<TEntity> {
    orderBy: keyof TEntity
    orderDirection?: 'asc' | 'desc'
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

const DEFAULT_RPC_URLS: Record<number, string> = {
    [CHAINS.kubTestnet]: 'https://rpc-testnet.bitkubchain.io',
    [CHAINS.bitkub]: 'https://rpc.bitkubchain.io',
    [CHAINS.jbc]: 'https://rpc-l1.jibchain.net',
}

export function parseRpcUrl(value: string | undefined, chainId: number): string {
    const url = value ?? process.env.JUNO_MONETA_RPC_URL ?? DEFAULT_RPC_URLS[chainId]
    if (!url) {
        throw new UsageError(
            `no rpc endpoint for chain ${chainId} (pass --rpcUrl or set JUNO_MONETA_RPC_URL)`
        )
    }
    return url
}

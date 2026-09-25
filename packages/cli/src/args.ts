const CHAINS = {
    kubTestnet: 25925,
    bitkub: 96,
    jbc: 8899,
    bsc: 56,
    base: 8453,
    worldchain: 480,
} as const

export const CHAIN_SLUGS = Object.keys(CHAINS) as (keyof typeof CHAINS)[]

export type Parse<T> = (value: string | undefined, flag: string) => T

function fail(message: string): never {
    throw new Error(message)
}

function required(value: string | undefined, flag: string): string {
    return value?.trim() ?? fail(`missing required flag --${flag}`)
}

function match(value: string | undefined, flag: string, pattern: RegExp, expected: string) {
    const text = required(value, flag)
    return pattern.test(text) ? text : fail(`invalid --${flag} "${text}" (expected ${expected})`)
}

export const optional =
    <T, D = undefined>(parse: Parse<T>, fallback?: D): Parse<NoInfer<T | D>> =>
    (value, flag) =>
        value === undefined ? (fallback as D) : parse(value, flag)

const list =
    <T>(item: Parse<T>): Parse<T[]> =>
    (value, flag) => {
        const items = required(value, flag)
            .split(',')
            .filter((text) => text.trim() !== '')
        if (items.length === 0) fail(`--${flag} requires at least one value`)
        return items.map((text) => item(text, flag))
    }

export const parseAddress: Parse<string> = (value, flag) =>
    match(value, flag, /^0x[0-9a-fA-F]{40}$/, '0x + 40 hex chars').toLowerCase()

export const parseAddressList = list(parseAddress)

export const parseTokenIds = list((value, flag) =>
    BigInt(match(value, flag, /^\d+$/, 'a non-negative integer'))
)

export const parseInteger: Parse<number> = (value, flag) =>
    Number(match(value, flag, /^-?\d+$/, 'a whole number'))

export const parsePositiveInt: Parse<number> = (value, flag) =>
    Number(match(value, flag, /^0*[1-9]\d*$/, 'a positive integer'))

export const parseUint: Parse<number> = (value, flag) =>
    Number(match(value, flag, /^\d+$/, 'a non-negative integer'))

export const parseBit: Parse<0 | 1> = (value, flag) =>
    Number(match(value, flag, /^[01]$/, '0 or 1')) as 0 | 1

export const parseName: Parse<string> = (value, flag) => match(value, flag, /./, 'a name')

const parseField: Parse<string> = (value, flag) =>
    match(value, flag, /^[A-Za-z_][A-Za-z0-9_]*$/, 'a plain field name')

export const parseEnum =
    <T extends string>(allowed: readonly T[]): Parse<T> =>
    (value, flag) => {
        const choice = required(value, flag) as T
        return allowed.includes(choice)
            ? choice
            : fail(`invalid --${flag} "${choice}" (expected one of: ${allowed.join(', ')})`)
    }

export const parseChainId: Parse<number> = (value, flag) => {
    const text = required(value, flag)
    if (/^\d+$/.test(text)) return Number(text)
    if (!Object.hasOwn(CHAINS, text)) {
        fail(`unknown chain "${text}" (expected a numeric id or one of: ${CHAIN_SLUGS.join(', ')})`)
    }
    return CHAINS[text as keyof typeof CHAINS]
}

export const parseTime: Parse<number> = (value, flag) => {
    const text = required(value, flag)
    const relative = /^(\d+)([mhd])$/.exec(text)
    if (relative) {
        const unit = { m: 60, h: 3600, d: 86400 }[relative[2] as 'm' | 'h' | 'd']
        return Math.floor(Date.now() / 1000) - Number(relative[1]) * unit
    }
    return Number(match(text, flag, /^\d+$/, 'unix seconds or a span like 30m, 24h, 7d'))
}

export function parsePonderUrl(value: string | undefined): string {
    return (
        (value ?? process.env.JUNO_MONETA_PONDER_URL ?? process.env.JUNOSWAP_PONDER_URL) ||
        fail('missing indexer endpoint (pass --ponderUrl or set JUNO_MONETA_PONDER_URL)')
    )
}

export function parseFields<K extends string>(
    value: string | undefined,
    presets: Record<string, readonly K[]>,
    fallback: readonly K[]
): readonly K[] {
    if (value === undefined) return fallback
    return presets[value] ?? (list(parseField)(value, 'fields') as K[])
}

export interface QueryOrder<K> {
    orderBy: K
    orderDirection?: 'asc' | 'desc'
}

export function optionalOrder<K extends string>(
    orderBy: string | undefined,
    orderDirection: string | undefined
): QueryOrder<K> | undefined {
    if (orderBy === undefined) {
        if (orderDirection !== undefined) fail('--orderDirection requires --orderBy')
        return undefined
    }
    return {
        orderBy: parseField(orderBy, 'orderBy') as K,
        orderDirection: optional(parseEnum(['asc', 'desc'] as const))(
            orderDirection,
            'orderDirection'
        ),
    }
}

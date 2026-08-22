const COLOR =
    process.stdout.isTTY === true &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== 'dumb'

const ANSI = /\u001b\[[0-9;]*m/g

const INTEGERS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const DECIMALS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const SIGNIFICANT = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 })

const TIME_KEY = /(?:^|[a-z])(?:Time|At)$|(?:^|\.)timestamp$/
const GROUP_FROM = 1e6

const NULL_TEXT = '—'

export function dim(text: string): string {
    return COLOR ? `\u001b[2m${text}\u001b[22m` : text
}

export function width(text: string): number {
    return text.replace(ANSI, '').length
}

export function pad(text: string, size: number, right: boolean): string {
    const fill = ' '.repeat(Math.max(0, size - width(text)))
    return right ? fill + text : text + fill
}

export function isScalar(value: unknown): boolean {
    if (value === null || value === undefined) return true
    const type = typeof value
    return type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint'
}

function formatNumber(value: number, key: string | undefined): string {
    if (!Number.isFinite(value)) return String(value)
    if (key !== undefined && TIME_KEY.test(key) && value >= 1e9 && value <= 4e9) {
        return new Date(value * 1000).toISOString()
    }
    if (Number.isInteger(value)) {
        return Math.abs(value) < GROUP_FROM ? String(value) : INTEGERS.format(value)
    }
    const abs = Math.abs(value)
    if (abs >= 1) return DECIMALS.format(value)
    if (abs >= 1e-9) return SIGNIFICANT.format(value)
    return value.toExponential(4)
}

export function formatScalar(value: unknown, key?: string): string {
    if (value === null || value === undefined) return dim(NULL_TEXT)
    if (typeof value === 'number') return formatNumber(value, key)
    if (typeof value === 'bigint') return value.toString()
    return String(value)
}

function replacer(_key: string, value: unknown): unknown {
    if (value instanceof Set) return [...value]
    return typeof value === 'bigint' ? value.toString() : value
}

export function formatJson(value: unknown): string {
    if (value === undefined) return 'null'
    return JSON.stringify(value, replacer, 2)
}

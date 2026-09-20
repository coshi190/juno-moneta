import { styleText } from 'node:util'

const COLOR = styleText('dim', 'x') !== 'x'
const NUMBERS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const TIME_KEY = /(?:^|[a-z])(?:Time|At)$|(?:^|\.)timestamp$/
const EMPTY = '(no results)'

type Row = Record<string, unknown>

function dim(text: string): string {
    return COLOR ? styleText('dim', text, { validateStream: false }) : text
}

function isScalar(value: unknown): boolean {
    return value === null || value === undefined || typeof value !== 'object'
}

function isRecord(value: unknown): value is Row {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumeric(value: unknown): boolean {
    return value == null || typeof value === 'number' || typeof value === 'bigint'
}

function formatNumber(value: number, key: string | undefined): string {
    if (!Number.isFinite(value)) return String(value)
    if (key !== undefined && TIME_KEY.test(key) && value >= 1e9 && value <= 4e9) {
        return new Date(value * 1000).toISOString()
    }
    if (Number.isInteger(value))
        return Math.abs(value) < 1e6 ? String(value) : NUMBERS.format(value)
    return Math.abs(value) >= 1 ? NUMBERS.format(value) : String(value)
}

function formatScalar(value: unknown, key?: string): string {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'number') return formatNumber(value, key)
    return String(value)
}

function flatten(row: Row, key?: string): Row {
    const out: Row = key === undefined ? {} : { key }
    for (const [name, value] of Object.entries(row)) {
        if (!isRecord(value)) out[name] = value
        else for (const [child, inner] of Object.entries(value)) out[`${name}.${child}`] = inner
    }
    return out
}

function renderTable(rows: Row[]): string[] {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const cells = rows.map((row) => columns.map((name) => formatScalar(row[name], name)))
    const right = columns.map((name) => rows.every((row) => isNumeric(row[name])))
    const widths = columns.map((n, i) =>
        Math.max(n.length, ...cells.map((r) => (r[i] ?? '').length))
    )
    const pad = (v: string, i: number): string =>
        right[i] === true ? v.padStart(widths[i] ?? 0) : v.padEnd(widths[i] ?? 0)
    const line = (values: string[]): string => values.map(pad).join('  ').trimEnd()
    return [dim(line(columns)), ...cells.map(line)]
}

function renderPairs(entries: (readonly [string, unknown])[]): string[] {
    const width = Math.max(0, ...entries.filter(([, v]) => isScalar(v)).map(([k]) => k.length))
    return entries.flatMap(([key, value]) => {
        const label = `${dim(key.padEnd(width))}  `
        if (isScalar(value)) return [(label + formatScalar(value, key)).trimEnd()]
        if (Array.isArray(value) && value.length === 0) return [label + dim(EMPTY)]
        return [dim(key), ...renderLines(value).map((line) => (line === '' ? line : `  ${line}`))]
    })
}

function renderArray(items: unknown[]): string[] {
    if (items.length === 0) return [dim(EMPTY)]
    if (items.every(isRecord)) return renderTable(items.map((row) => flatten(row)))
    return items.map((value) => formatScalar(value))
}

function renderRecord(record: Row): string[] {
    const entries = Object.entries(record)
    if (entries.length === 0) return [dim(EMPTY)]
    if (!entries.every(([, value]) => isRecord(value))) return renderPairs(entries)
    return renderTable(entries.map(([key, value]) => flatten(value as Row, key)))
}

function renderLines(value: unknown): string[] {
    if (Array.isArray(value)) return renderArray(value)
    if (isRecord(value)) return renderRecord(value)
    return [formatScalar(value)]
}

export function render(value: unknown): string {
    return renderLines(value).join('\n')
}

export function formatJson(value: unknown): string {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
}

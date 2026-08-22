import { dim, formatScalar, isScalar, pad, width } from './format.js'

type Row = Record<string, unknown>

const GAP = '  '
const INDENT = '  '
const EMPTY = '(no results)'
const KEY_COLUMN = 'key'
const RULE_WIDTH = 24
const FALLBACK_WIDTH = 120

function terminalWidth(): number {
    if (process.stdout.isTTY !== true) return Number.POSITIVE_INFINITY
    return process.stdout.columns ?? FALLBACK_WIDTH
}

function normalize(value: unknown): unknown {
    return value instanceof Set ? [...value] : value
}

function isRecord(value: unknown): value is Row {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScalarArray(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.every(isScalar)
}

function indentAll(lines: string[], prefix: string): string[] {
    return lines.map((line) => (line.length > 0 ? prefix + line : line))
}

function flatten(row: Row, key?: string): Row {
    const out: Row = {}
    if (key !== undefined) out[KEY_COLUMN] = key
    for (const [name, raw] of Object.entries(row)) {
        const value = normalize(raw)
        if (isRecord(value)) {
            for (const [child, inner] of Object.entries(value)) {
                out[`${name}.${child}`] = normalize(inner)
            }
        } else {
            out[name] = value
        }
    }
    return out
}

function renderPairs(entries: (readonly [string, unknown])[]): string[] {
    const labels = entries
        .filter(([, value]) => isScalar(value) || isScalarArray(value))
        .map(([key]) => key.length)
    const labelWidth = labels.length > 0 ? Math.max(...labels) : 0
    const lines: string[] = []

    const inline = entries.every(([key, value]) => {
        if (!isScalarArray(value) || value.length === 0) return true
        const joined = value.map((item) => formatScalar(item, key)).join(', ')
        return labelWidth + GAP.length + width(joined) <= terminalWidth()
    })

    for (const [key, value] of entries) {
        const label = dim(pad(key, labelWidth, false)) + GAP
        if (isScalar(value)) {
            lines.push((label + formatScalar(value, key)).trimEnd())
        } else if (isScalarArray(value)) {
            if (value.length === 0) {
                lines.push(label + dim(EMPTY))
                continue
            }
            const cells = value.map((item) => formatScalar(item, key))
            if (inline) {
                lines.push(label + cells.join(', '))
            } else {
                lines.push(dim(key))
                lines.push(...indentAll(cells, INDENT))
            }
        } else {
            lines.push(dim(key))
            lines.push(...indentAll(renderLines(value), INDENT))
        }
    }
    return lines
}

function blockRule(index: number): string {
    return dim(`── [${index}] ${'─'.repeat(RULE_WIDTH)}`)
}

function renderBlocks(rows: Row[]): string[] {
    return rows.flatMap((row, index) => [blockRule(index), ...renderPairs(Object.entries(row))])
}

function renderTable(rows: Row[]): string[] {
    const columns: string[] = []
    for (const row of rows) {
        for (const name of Object.keys(row)) {
            if (!columns.includes(name)) columns.push(name)
        }
    }

    if (rows.some((row) => Object.values(row).some((value) => !isScalar(value)))) {
        return renderBlocks(rows)
    }

    const cells = rows.map((row) => columns.map((name) => formatScalar(row[name], name)))
    const numeric = columns.map((name) =>
        rows.every((row) => {
            const value = row[name]
            return (
                value === null ||
                value === undefined ||
                typeof value === 'number' ||
                typeof value === 'bigint'
            )
        })
    )
    const widths = columns.map((name, index) =>
        Math.max(width(name), ...cells.map((row) => width(row[index] ?? '')))
    )
    const total =
        widths.reduce((sum, size) => sum + size, 0) + GAP.length * Math.max(0, widths.length - 1)
    if (total > terminalWidth()) return renderBlocks(rows)

    const line = (values: string[]): string =>
        values
            .map((value, index) => pad(value, widths[index] ?? 0, numeric[index] ?? false))
            .join(GAP)
            .trimEnd()

    return [dim(line(columns)), ...cells.map(line)]
}

function renderArray(items: unknown[]): string[] {
    const values = items.map(normalize)
    if (values.length === 0) return [dim(EMPTY)]
    if (values.every(isScalar)) return values.map((value) => formatScalar(value))
    if (values.every(isRecord)) return renderTable(values.map((row) => flatten(row)))
    return values.flatMap((value, index) => [blockRule(index), ...renderLines(value)])
}

function renderRecord(record: Row): string[] {
    const entries = Object.entries(record).map(([key, value]) => [key, normalize(value)] as const)
    if (entries.length === 0) return [dim(EMPTY)]
    if (entries.every(([, value]) => isRecord(value))) {
        return renderTable(entries.map(([key, value]) => flatten(value as Row, key)))
    }
    return renderPairs(entries)
}

function renderLines(value: unknown): string[] {
    const item = normalize(value)
    if (isScalar(item)) return [formatScalar(item)]
    if (Array.isArray(item)) return renderArray(item)
    if (isRecord(item)) return renderRecord(item)
    return [String(item)]
}

export function render(value: unknown): string {
    return renderLines(value).join('\n')
}

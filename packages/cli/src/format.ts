function replacer(_key: string, value: unknown): unknown {
    return value instanceof Set ? [...value] : value
}

function isScalar(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function format(value: unknown, raw = false): string {
    if (value === undefined) return 'null'
    if (raw && isScalar(value)) return String(value)
    return JSON.stringify(value, replacer, 2)
}

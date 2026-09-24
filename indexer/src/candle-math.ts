export const CANDLE_DURATIONS = [60, 300, 900, 3600, 14400, 86400] as const

interface Candle {
    open: number
    high: number
    low: number
    close: number
}

export function foldCandle(existing: Candle | null, price: number, openIfNew?: number): Candle {
    if (!existing) {
        const open = openIfNew !== undefined && openIfNew > 0 ? openIfNew : price
        return {
            open,
            high: Math.max(open, price),
            low: Math.min(open, price),
            close: price,
        }
    }
    return {
        open: existing.open,
        high: Math.max(existing.high, price),
        low: Math.min(existing.low, price),
        close: price,
    }
}

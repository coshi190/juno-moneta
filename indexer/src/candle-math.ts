export const CANDLE_DURATIONS = [60, 300, 900, 3600, 14400, 86400] as const

export interface Candle {
    open: number
    high: number
    low: number
    close: number
    volume: number
}

export function foldCandle(
    existing: Candle | null,
    price: number,
    volume: number,
    openIfNew?: number
): Candle {
    if (!existing) {
        const open = openIfNew !== undefined && openIfNew > 0 ? openIfNew : price
        return {
            open,
            high: Math.max(open, price),
            low: Math.min(open, price),
            close: price,
            volume,
        }
    }
    return {
        open: existing.open,
        high: Math.max(existing.high, price),
        low: Math.min(existing.low, price),
        close: price,
        volume: existing.volume + volume,
    }
}

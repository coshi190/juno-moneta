import schema from 'ponder:schema'

const CANDLE_DURATIONS = [60, 300, 900, 3600, 14400, 86400] as const

interface Candle {
    open: number
    high: number
    low: number
    close: number
}

function foldCandle(existing: Candle | null, price: number, openIfNew?: number): Candle {
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

export async function foldTokenCandle(
    context: any,
    chainId: number,
    tokenAddr: string,
    source: 'v3' | 'bc',
    timestamp: number,
    price: number,
    openIfNew?: number
) {
    if (!(price > 0)) return

    for (const duration of CANDLE_DURATIONS) {
        const bucketTs = Math.floor(timestamp / duration) * duration
        const id = `${chainId}-${tokenAddr}-${source}-${duration}-${bucketTs}`
        const existing = await context.db.find(schema.tokenCandle, { id })
        const folded = foldCandle(existing, price, openIfNew)

        if (!existing) {
            await context.db
                .insert(schema.tokenCandle)
                .values({
                    id,
                    chainId,
                    tokenAddr,
                    source,
                    duration,
                    bucketTs,
                    open: folded.open,
                    high: folded.high,
                    low: folded.low,
                    close: folded.close,
                    updatedAt: timestamp,
                })
                .onConflictDoNothing()
        } else {
            await context.db.update(schema.tokenCandle, { id }).set({
                open: folded.open,
                high: folded.high,
                low: folded.low,
                close: folded.close,
                updatedAt: timestamp,
            })
        }
    }
}

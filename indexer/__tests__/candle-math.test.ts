import { describe, it, expect } from 'vitest'
import { foldCandle, CANDLE_DURATIONS } from '../src/candle-math'

describe('foldCandle', () => {
    it('opens a new bucket at the trade price when no open override is given (V3)', () => {
        const c = foldCandle(null, 100, 5)
        expect(c).toEqual({ open: 100, high: 100, low: 100, close: 100, volume: 5 })
    })

    it('opens a new bucket at the pre-swap price when given (bonding curve)', () => {
        const c = foldCandle(null, 100, 5, 90)
        expect(c).toEqual({ open: 90, high: 100, low: 90, close: 100, volume: 5 })
    })

    it('ignores a non-positive open override, falling back to the trade price', () => {
        expect(foldCandle(null, 100, 5, 0).open).toBe(100)
    })

    it('extends high/low, moves close, and accumulates volume on an existing bucket', () => {
        const first = foldCandle(null, 100, 5)
        const second = foldCandle(first, 120, 3)
        const third = foldCandle(second, 80, 2)
        expect(third).toEqual({ open: 100, high: 120, low: 80, close: 80, volume: 10 })
    })

    it('keeps the original open across subsequent folds', () => {
        const a = foldCandle(null, 50, 1, 40)
        const b = foldCandle(a, 200, 1)
        expect(b.open).toBe(40)
        expect(b.high).toBe(200)
    })

    it('materialises the six chart timeframes', () => {
        expect([...CANDLE_DURATIONS]).toEqual([60, 300, 900, 3600, 14400, 86400])
    })
})

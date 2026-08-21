import { describe, it, expect } from 'vitest'
import { getFullRange, isFullRange, snapTickRange } from '../pool/tick-ranges'
import { MAX_TICK, MIN_TICK } from '../pool/tick-math'

const SPACINGS = [1, 10, 50, 60, 200]

describe('snapTickRange', () => {
    it('snaps both bounds to the spacing', () => {
        const range = snapTickRange(-1234, 5678, 60)
        expect(Math.abs(range.tickLower % 60)).toBe(0)
        expect(Math.abs(range.tickUpper % 60)).toBe(0)
    })

    it('never returns an upper bound at or below the lower', () => {
        for (const spacing of SPACINGS) {
            const range = snapTickRange(100, 100, spacing)
            expect(range.tickUpper).toBeGreaterThan(range.tickLower)
            expect(range.tickUpper - range.tickLower).toBe(spacing)
        }
    })

    it('widens a range that collapses after snapping', () => {
        const range = snapTickRange(10, 20, 200)
        expect(range.tickUpper).toBeGreaterThan(range.tickLower)
    })
})

describe('getFullRange', () => {
    it('lands on spacing multiples inside the representable range', () => {
        for (const spacing of SPACINGS) {
            const range = getFullRange(spacing)
            expect(Math.abs(range.tickLower % spacing)).toBe(0)
            expect(Math.abs(range.tickUpper % spacing)).toBe(0)
            expect(range.tickLower).toBeGreaterThanOrEqual(MIN_TICK)
            expect(range.tickUpper).toBeLessThanOrEqual(MAX_TICK)
            expect(range.tickUpper).toBeGreaterThan(range.tickLower)
        }
    })
})

describe('isFullRange', () => {
    it('is true at exactly the tolerance boundary', () => {
        expect(isFullRange(MIN_TICK + 256, MAX_TICK - 256)).toBe(true)
    })

    it('is false one tick beyond the tolerance', () => {
        expect(isFullRange(MIN_TICK + 257, MAX_TICK - 257)).toBe(false)
    })

    it('honours a custom tolerance', () => {
        expect(isFullRange(MIN_TICK + 1000, MAX_TICK - 1000, 1000)).toBe(true)
        expect(isFullRange(MIN_TICK + 1000, MAX_TICK - 1000, 10)).toBe(false)
    })

    it('treats a snapped full range as full', () => {
        for (const spacing of SPACINGS) {
            const range = getFullRange(spacing)
            expect(isFullRange(range.tickLower, range.tickUpper)).toBe(true)
        }
    })
})

import { describe, it, expect } from 'vitest'
import {
    tickToSqrtPriceX96,
    sqrtPriceX96ToTick,
    priceToTick,
    priceToSqrtPriceX96,
    nearestUsableTick,
    isInRange,
    sortTokens,
    MIN_TICK,
    MAX_TICK,
    MIN_SQRT_RATIO,
} from '../pool/tick-math.js'
import { priceFromSqrtPriceX96 } from '../pool/pool-tvl-math.js'

const Q96 = 2n ** 96n

describe('tickToSqrtPriceX96', () => {
    it('returns ~2^96 for tick 0', () => {
        expect(Number(tickToSqrtPriceX96(0)) / Number(Q96)).toBeCloseTo(1.0, 4)
    })

    it('is monotonically increasing in tick', () => {
        const ticks = [-887000, -10000, -1000, 0, 1000, 10000, 887000]
        const sqrtPrices = ticks.map(tickToSqrtPriceX96)
        for (let i = 1; i < sqrtPrices.length; i++) {
            expect(sqrtPrices[i]!).toBeGreaterThan(sqrtPrices[i - 1]!)
        }
    })

    it('stays at or above MIN_SQRT_RATIO across the representable range', () => {
        expect(tickToSqrtPriceX96(MIN_TICK)).toBeGreaterThanOrEqual(MIN_SQRT_RATIO)
    })
})

describe('sqrtPriceX96ToTick', () => {
    it('round-trips exactly at representative ticks', () => {
        const ticks = [
            -887272, -400000, -200000, -100000, -5000, -1000, -1, 0, 1, 1000, 5000, 100000, 200000,
            400000, 887271,
        ]
        const mismatches = ticks.filter((t) => sqrtPriceX96ToTick(tickToSqrtPriceX96(t)) !== t)
        expect(mismatches).toEqual([])
    })

    it('round-trips exactly across a full sweep of the tick range', () => {
        const mismatches: number[] = []
        for (let tick = MIN_TICK; tick <= MAX_TICK; tick += 977) {
            if (sqrtPriceX96ToTick(tickToSqrtPriceX96(tick)) !== tick) mismatches.push(tick)
        }
        expect(mismatches).toEqual([])
    })

    it('does not double the tick for small positive inputs', () => {
        expect(sqrtPriceX96ToTick(tickToSqrtPriceX96(1000))).toBe(1000)
        expect(sqrtPriceX96ToTick(tickToSqrtPriceX96(-1))).toBe(-1)
    })
})

describe('priceToTick', () => {
    it('round-trips approximately for same decimals', () => {
        const tick = 1000
        const price = priceFromSqrtPriceX96(tickToSqrtPriceX96(tick), 18, 18)
        expect(Math.abs(priceToTick(String(price), 18, 18) - tick)).toBeLessThanOrEqual(1)
    })

    it('handles asymmetric decimal pairs', () => {
        const tick = 500
        const price = priceFromSqrtPriceX96(tickToSqrtPriceX96(tick), 6, 18)
        expect(Math.abs(priceToTick(String(price), 6, 18) - tick)).toBeLessThanOrEqual(2)
    })

    it('collapses non-positive prices to MIN_TICK', () => {
        expect(priceToTick('0', 18, 18)).toBe(MIN_TICK)
        expect(priceToTick('-1', 18, 18)).toBe(MIN_TICK)
    })
})

describe('priceToSqrtPriceX96', () => {
    it('returns MIN_SQRT_RATIO rather than 0 for non-positive input', () => {
        expect(priceToSqrtPriceX96('0', 18, 18)).toBe(MIN_SQRT_RATIO)
        expect(priceToSqrtPriceX96('-1', 18, 18)).toBe(MIN_SQRT_RATIO)
    })

    it('round-trips approximately with priceFromSqrtPriceX96', () => {
        const sqrtPrice = tickToSqrtPriceX96(1000)
        const price = priceFromSqrtPriceX96(sqrtPrice, 18, 18)
        const recovered = priceToSqrtPriceX96(String(price), 18, 18)
        expect(Number(recovered) / Number(sqrtPrice)).toBeCloseTo(1.0, 2)
    })
})

describe('priceFromSqrtPriceX96 vs the legacy float formula', () => {
    function legacyFloatPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
        const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
        return sqrtPrice * sqrtPrice * Math.pow(10, decimals0 - decimals1)
    }

    const decimalPairs: [number, number][] = [
        [18, 18],
        [18, 6],
        [6, 18],
        [8, 18],
        [18, 8],
    ]

    it('agrees within 1e-9 relative error across ticks and decimal pairs', () => {
        for (const tick of [-200000, -50000, -10000, -1000, 0, 1000, 10000, 50000, 200000]) {
            const sqrtPriceX96 = tickToSqrtPriceX96(tick)
            for (const [d0, d1] of decimalPairs) {
                const exact = priceFromSqrtPriceX96(sqrtPriceX96, d0, d1)
                const legacy = legacyFloatPrice(sqrtPriceX96, d0, d1)
                const relative = Math.abs(exact - legacy) / Math.max(Math.abs(exact), 1e-300)
                expect(relative).toBeLessThan(1e-9)
            }
        }
    })

    it('returns 0 for an uninitialised pool where the legacy formula also gave 0', () => {
        expect(priceFromSqrtPriceX96(0n, 18, 18)).toBe(0)
        expect(legacyFloatPrice(0n, 18, 18)).toBe(0)
    })
})

describe('nearestUsableTick', () => {
    it('snaps to the nearest multiple of tick spacing', () => {
        expect(nearestUsableTick(65, 60)).toBe(60)
        expect(nearestUsableTick(35, 60)).toBe(60)
    })

    it('keeps clamped results inside the representable range', () => {
        expect(nearestUsableTick(MIN_TICK, 60)).toBeGreaterThanOrEqual(MIN_TICK)
        expect(nearestUsableTick(MAX_TICK, 60)).toBeLessThanOrEqual(MAX_TICK)
    })
})

describe('isInRange', () => {
    it('treats the lower bound as inclusive and the upper as exclusive', () => {
        expect(isInRange(-100, -100, 100)).toBe(true)
        expect(isInRange(0, -100, 100)).toBe(true)
        expect(isInRange(100, -100, 100)).toBe(false)
    })
})

describe('sortTokens', () => {
    it('orders by lowercased address regardless of input casing', () => {
        const [first, second] = sortTokens({ address: '0xBbb' }, { address: '0xAaa' })
        expect(first.address).toBe('0xAaa')
        expect(second.address).toBe('0xBbb')
    })

    it('preserves order when already sorted', () => {
        const tokenA = { address: '0x111' }
        const tokenB = { address: '0x222' }
        const [first, second] = sortTokens(tokenA, tokenB)
        expect(first).toBe(tokenA)
        expect(second).toBe(tokenB)
    })
})

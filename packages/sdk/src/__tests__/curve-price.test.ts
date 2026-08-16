import { describe, it, expect } from 'vitest'
import { calculatePriceFromSqrtPrice } from '../launchpad/curve-price.js'
import { priceFromSqrtPriceX96 } from '../pool/pool-tvl-math.js'

const sqrtFor = (ratio: number) => BigInt(Math.floor(Math.sqrt(ratio) * 2 ** 96))

describe('calculatePriceFromSqrtPrice', () => {
    it('returns 0 for an uninitialised pool in both directions', () => {
        expect(calculatePriceFromSqrtPrice(0n, true)).toBe(0)
        expect(calculatePriceFromSqrtPrice(0n, false)).toBe(0)
    })

    it('returns 0 for a negative sqrtPriceX96 in both directions', () => {
        expect(calculatePriceFromSqrtPrice(-1n, true)).toBe(0)
        expect(calculatePriceFromSqrtPrice(-1n, false)).toBe(0)
    })

    it('returns 0 rather than Infinity when the ratio underflows the 1e18 fixed point', () => {
        const s = sqrtFor(1e-20)
        expect(priceFromSqrtPriceX96(s, 18, 18)).toBe(0)
        expect(calculatePriceFromSqrtPrice(s, true)).toBe(0)
        expect(calculatePriceFromSqrtPrice(s, false)).toBe(0)
    })

    it('is exactly the shared 18/18 helper when the token is token0', () => {
        for (const ratio of [4.375e-6, 1e-9, 1e-12, 1e-15, 1e-18]) {
            const s = sqrtFor(ratio)
            expect(calculatePriceFromSqrtPrice(s, true)).toBe(priceFromSqrtPriceX96(s, 18, 18))
        }
    })

    it('inverts when the token is token1', () => {
        for (const ratio of [4.375e-6, 1e-9, 1e-12]) {
            const s = sqrtFor(1 / ratio)
            const inverted = calculatePriceFromSqrtPrice(s, false)
            const direct = calculatePriceFromSqrtPrice(s, true)
            expect(Math.abs(inverted - 1 / direct) / (1 / direct)).toBeLessThan(1e-12)
            expect(Math.abs(inverted - ratio) / ratio).toBeLessThan(1e-9)
        }
    })
})

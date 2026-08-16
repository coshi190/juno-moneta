import { describe, it, expect } from 'vitest'
import { computePoints, computeReferralPoints, isJunoswapProtocol } from '../rewards/points.js'

describe('computePoints', () => {
    it('scores junoswap volume at 1 point per 50 native', () => {
        expect(computePoints(100, 0)).toBe(2)
    })

    it('discounts external volume 10x (1 point per 500 native)', () => {
        expect(computePoints(1000, 0)).toBe(20)
        expect(computePoints(0, 1000)).toBe(2)
    })

    it('sums both sources before flooring', () => {
        expect(computePoints(25, 250)).toBe(1)
        expect(computePoints(50, 500)).toBe(2)
    })
})

describe('computeReferralPoints', () => {
    it('awards 10% of the summed referee points, floored once', () => {
        expect(computeReferralPoints([1200, 340])).toBe(154)
    })

    it('floors the aggregate, not per referee', () => {
        expect(computeReferralPoints([5, 5])).toBe(1)
        expect(computeReferralPoints([])).toBe(0)
    })
})

describe('isJunoswapProtocol', () => {
    it('counts only junoswap as the first-party venue', () => {
        expect(isJunoswapProtocol('junoswap')).toBe(true)
        expect(isJunoswapProtocol('jibswap')).toBe(false)
        expect(isJunoswapProtocol('kublerx')).toBe(false)
        expect(isJunoswapProtocol('unknown')).toBe(false)
        expect(isJunoswapProtocol('')).toBe(false)
    })
})

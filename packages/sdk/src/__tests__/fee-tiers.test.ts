import { describe, it, expect } from 'vitest'
import { getFeeTierInfo, getTickSpacing, listFeeTiers } from '../pool/fee-tiers'
import { CHAIN_IDS } from '../configs/chains'

describe('getTickSpacing', () => {
    it('maps every known fee tier', () => {
        expect(getTickSpacing(100)).toBe(1)
        expect(getTickSpacing(500)).toBe(10)
        expect(getTickSpacing(2500)).toBe(50)
        expect(getTickSpacing(3000)).toBe(60)
        expect(getTickSpacing(10000)).toBe(200)
    })

    it('falls back to 60 for an unknown fee', () => {
        expect(getTickSpacing(1234)).toBe(60)
    })
})

describe('getFeeTierInfo', () => {
    it('bundles fee and spacing without any presentation', () => {
        expect(getFeeTierInfo(500)).toEqual({ fee: 500, tickSpacing: 10 })
    })
})

describe('listFeeTiers', () => {
    it('returns configured tiers with spacing for a known chain', () => {
        const tiers = listFeeTiers(CHAIN_IDS.bitkub)
        expect(tiers.length).toBeGreaterThan(0)
        for (const tier of tiers) {
            expect(tier.tickSpacing).toBe(getTickSpacing(tier.fee))
        }
    })

    it('tracks the per dex fee tiers when a dexId is given', () => {
        const pancake = listFeeTiers(CHAIN_IDS.bsc, 'pancakeswap').map((tier) => tier.fee)
        expect(pancake).toContain(2500)
        expect(pancake).not.toContain(3000)

        const junoswap = listFeeTiers(CHAIN_IDS.bitkub).map((tier) => tier.fee)
        expect(junoswap).toContain(3000)
        expect(junoswap).not.toContain(2500)
    })

    it('falls back to the standard tiers when the default dex is absent from the chain', () => {
        expect(listFeeTiers(CHAIN_IDS.bsc).map((tier) => tier.fee)).toEqual([100, 500, 3000, 10000])
    })

    it('falls back to all standard tiers for an unconfigured chain', () => {
        expect(listFeeTiers(999999).map((tier) => tier.fee)).toEqual([100, 500, 3000, 10000])
    })
})

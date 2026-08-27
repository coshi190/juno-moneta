import { describe, it, expect } from 'vitest'
import { getTickSpacing, listFeeTiers } from '../pool/fee-tiers'
import { CHAIN_IDS } from '../configs/chains'

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

import { describe, it, expect } from 'vitest'
import { CHAIN_IDS } from '../configs/chains.js'
import {
    ALL_FEE_TIERS,
    ProtocolType,
    getFeeTiers,
    getTickSpacing,
    getV3Config,
    listFeeTiers,
    resolveDexIds,
} from '../configs/dex-config.js'

describe('configs/dex-config', () => {
    describe('getFeeTiers', () => {
        it('honors the tiers a DEX actually runs — Pancake V3 has 2500 and no 3000', () => {
            const tiers = getFeeTiers(getV3Config(CHAIN_IDS.bsc, 'pancakeswap'))
            expect(tiers).toContain(2500)
            expect(tiers).not.toContain(3000)
        })

        it('falls back to the four canonical tiers when the config declares none', () => {
            expect(getFeeTiers(undefined)).toEqual(ALL_FEE_TIERS)
        })
    })

    describe('getTickSpacing', () => {
        it('falls back to the 60 spacing for a fee tier it has never heard of', () => {
            expect(getTickSpacing(4200)).toBe(60)
        })
    })

    describe('listFeeTiers', () => {
        it('falls back to the standard tiers when the default dex is absent from the chain', () => {
            expect(listFeeTiers(CHAIN_IDS.bsc).map((tier) => tier.fee)).toEqual([
                100, 500, 3000, 10000,
            ])
        })

        it('falls back to all standard tiers for an unconfigured chain', () => {
            expect(listFeeTiers(999999).map((tier) => tier.fee)).toEqual([100, 500, 3000, 10000])
        })
    })

    describe('resolveDexIds', () => {
        it('returns every V3 DEX on the chain when none is requested', () => {
            const ids = resolveDexIds(CHAIN_IDS.bitkub, ProtocolType.V3)
            expect(ids).toContain('junoswap')
            expect(ids).toContain('kublerx')
        })

        it('keeps every id in an array, not just the first', () => {
            const ids = resolveDexIds(CHAIN_IDS.bitkub, ProtocolType.V3, ['junoswap', 'kublerx'])
            expect(ids).toEqual(['junoswap', 'kublerx'])
        })

        it('drops ids with no config for the protocol on that chain', () => {
            expect(
                resolveDexIds(CHAIN_IDS.bitkub, ProtocolType.V3, ['junoswap', 'pancakeswap'])
            ).toEqual(['junoswap'])
        })
    })
})

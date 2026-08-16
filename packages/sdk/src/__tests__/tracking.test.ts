import { describe, it, expect } from 'vitest'
import {
    appendTrackingTag,
    buildTrackingSuffix,
    normalizeReferrer,
    DEFAULT_REFERRER,
    JUNOSWAP_CALLDATA_MARKER,
    parseTrackingTag,
    resolveBinding,
} from '../rewards/tracking.js'
import type { Address } from 'viem'

const REF: Address = '0x1111111111111111111111111111111111111111'
const SWAP_CALLDATA = ('0x38ed1739' + 'ab'.repeat(160)) as `0x${string}`

describe('buildTrackingSuffix', () => {
    it('is marker + referrer = 24 bytes', () => {
        const suffix = buildTrackingSuffix(REF)
        expect(suffix.startsWith(JUNOSWAP_CALLDATA_MARKER)).toBe(true)
        expect(suffix.length).toBe(2 + 48)
        expect(suffix.toLowerCase().endsWith(REF.slice(2))).toBe(true)
    })
})

describe('normalizeReferrer', () => {
    it('passes through valid addresses and falls back otherwise', () => {
        expect(normalizeReferrer(REF)).toBe(REF)
        expect(normalizeReferrer(null)).toBe(DEFAULT_REFERRER)
        expect(normalizeReferrer('not-an-address')).toBe(DEFAULT_REFERRER)
    })
})

describe('appendTrackingTag <-> parseTrackingTag', () => {
    it('marks the swap as frontend-originated and recovers the referrer', () => {
        const tagged = appendTrackingTag(SWAP_CALLDATA, REF)
        expect(tagged.startsWith(SWAP_CALLDATA)).toBe(true)
        expect(parseTrackingTag(tagged)).toEqual({ referrer: REF.toLowerCase() })
    })

    it('is frontend-originated with null referrer when no ref param was present', () => {
        const tagged = appendTrackingTag(SWAP_CALLDATA, normalizeReferrer(null))
        expect(DEFAULT_REFERRER).toBe('0x0000000000000000000000000000000000000000')
        expect(parseTrackingTag(tagged)).toEqual({ referrer: null })
    })

    it('returns null (not a frontend swap) for untagged, empty, and too-short input', () => {
        expect(parseTrackingTag(SWAP_CALLDATA)).toBeNull()
        expect(parseTrackingTag(undefined)).toBeNull()
        expect(parseTrackingTag('0x')).toBeNull()
        expect(parseTrackingTag('0x' + 'cd'.repeat(24))).toBeNull()
    })
})

describe('resolveBinding', () => {
    const A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

    it('binds a referee to a distinct referrer, lowercased', () => {
        expect(resolveBinding(A, B)).toEqual({
            referee: A.toLowerCase(),
            referrer: B.toLowerCase(),
        })
    })

    it('rejects a missing referrer', () => {
        expect(resolveBinding(A, null)).toBeNull()
    })

    it('rejects self-referral regardless of case', () => {
        expect(resolveBinding(A, A.toLowerCase())).toBeNull()
    })
})

import { describe, it, expect } from 'vitest'
import {
    makePriceAt,
    sanitizePricePoints,
    sanitizeUsdPrice,
    MAX_NATIVE_USD_PRICE,
    MAX_TOKEN_USD_PRICE,
} from '../src/price-history.js'

describe('price-history', () => {
    // Historical trades are priced at the last on-chain price before them, never the next one.
    it('makePriceAt returns the last price at or before a timestamp', () => {
        const priceAt = makePriceAt(
            [
                { timestamp: 10, price: 1 },
                { timestamp: 20, price: 2 },
                { timestamp: 30, price: 3 },
            ],
            null
        )
        expect(priceAt(5)).toBe(1)
        expect(priceAt(10)).toBe(1)
        expect(priceAt(25)).toBe(2)
        expect(priceAt(30)).toBe(3)
        expect(priceAt(999)).toBe(3)
    })

    // A token with no price history has to yield 0 USD, not NaN poisoning every downstream sum.
    it('makePriceAt falls back to the given price for an empty series', () => {
        expect(makePriceAt([], 7)(123)).toBe(7)
        expect(makePriceAt([], null)(123)).toBe(0)
    })

    // One absurd spike autoscales a whole chart into a flat line at the bottom.
    it('sanitizePricePoints drops non-finite, non-positive, and gross outliers', () => {
        const points = [
            { timestamp: 1, price: 1 },
            { timestamp: 2, price: 0 },
            { timestamp: 3, price: 2 },
            { timestamp: 4, price: Infinity },
            { timestamp: 5, price: 1e6 },
            { timestamp: 6, price: 3 },
            { timestamp: 7, price: 2 },
        ]
        expect(sanitizePricePoints(points).map((p) => p.timestamp)).toEqual([1, 3, 6, 7])
    })

    // Returning null is what stops a bogus sqrtPriceX96 decode from being persisted forever.
    it('sanitizeUsdPrice accepts in-band prices and rejects garbage', () => {
        expect(sanitizeUsdPrice(2.5, MAX_NATIVE_USD_PRICE)).toBe(2.5)
        expect(sanitizeUsdPrice(69000, MAX_TOKEN_USD_PRICE)).toBe(69000)
        expect(sanitizeUsdPrice(3.402823669e38, MAX_NATIVE_USD_PRICE)).toBeNull()
        expect(sanitizeUsdPrice(3.402823669e38, MAX_TOKEN_USD_PRICE)).toBeNull()
        expect(sanitizeUsdPrice(Infinity, MAX_TOKEN_USD_PRICE)).toBeNull()
        expect(sanitizeUsdPrice(NaN, MAX_TOKEN_USD_PRICE)).toBeNull()
        expect(sanitizeUsdPrice(0, MAX_TOKEN_USD_PRICE)).toBeNull()
        expect(sanitizeUsdPrice(-1, MAX_TOKEN_USD_PRICE)).toBeNull()
    })
})

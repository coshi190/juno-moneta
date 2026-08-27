import { describe, it, expect } from 'vitest'
import {
    computePoolPrice,
    computeTickPrice,
    getPoolDisplayOrder,
    getTickForPrice,
    invertSqrtPriceX96,
} from '../pool/pool-price'
import { priceFromSqrtPriceX96 } from '../pool/pool-usd-math'
import { tickToSqrtPriceX96 } from '../pool/tick-math'
import { CHAIN_IDS, STABLECOIN_ADDRESSES, WRAPPED_NATIVE_ADDRESSES } from '../configs/chains'

const Q96 = 2n ** 96n

describe('computePoolPrice', () => {
    it('returns 0 rather than Infinity for an uninitialised pool', () => {
        expect(computePoolPrice({ sqrtPriceX96: 0n, decimals0: 18, decimals1: 18 })).toBe(0)
        expect(
            computePoolPrice({ sqrtPriceX96: 0n, decimals0: 18, decimals1: 18, invert: true })
        ).toBe(0)
    })

    it('inverting yields the reciprocal', () => {
        const sqrtPriceX96 = Q96 * 2n
        const base = computePoolPrice({ sqrtPriceX96, decimals0: 18, decimals1: 18 })
        const inverted = computePoolPrice({
            sqrtPriceX96,
            decimals0: 18,
            decimals1: 18,
            invert: true,
        })
        expect(inverted).toBeCloseTo(1 / base, 12)
    })

    it('honours differing decimals', () => {
        const sqrtPriceX96 = Q96
        expect(computePoolPrice({ sqrtPriceX96, decimals0: 18, decimals1: 6 })).toBeCloseTo(1e12, 0)
    })
})

describe('computeTickPrice', () => {
    it('agrees exactly with the sqrt-price path', () => {
        for (const tick of [-200000, -60, 0, 60, 200000]) {
            expect(computeTickPrice({ tick, decimals0: 18, decimals1: 18 })).toBe(
                priceFromSqrtPriceX96(tickToSqrtPriceX96(tick), 18, 18)
            )
        }
    })

    it('drifts from the float 1.0001^tick approximation, and the drift grows with tick', () => {
        const drift = (tick: number): number => {
            const exact = computeTickPrice({ tick, decimals0: 18, decimals1: 18 })
            return Math.abs(exact - Math.pow(1.0001, tick)) / exact
        }
        const near = drift(100000)
        const far = drift(880000)
        expect(near).toBeGreaterThan(0)
        expect(far).toBeGreaterThan(near)
    })
})

describe('getTickForPrice', () => {
    it('round-trips through computeTickPrice', () => {
        for (const tick of [-10000, 0, 10000]) {
            const price = computeTickPrice({ tick, decimals0: 18, decimals1: 18 })
            const recovered = getTickForPrice({
                price: String(price),
                decimals0: 18,
                decimals1: 18,
            })
            expect(Math.abs(recovered - tick)).toBeLessThanOrEqual(1)
        }
    })

    it('snaps to tick spacing when given one', () => {
        const tick = getTickForPrice({
            price: '1.5',
            decimals0: 18,
            decimals1: 18,
            tickSpacing: 60,
        })
        expect(tick % 60).toBe(0)
    })

    it('inverting mirrors the tick around zero', () => {
        const up = getTickForPrice({ price: '2', decimals0: 18, decimals1: 18 })
        const down = getTickForPrice({ price: '2', decimals0: 18, decimals1: 18, invert: true })
        expect(Math.abs(up + down)).toBeLessThanOrEqual(1)
    })
})

describe('invertSqrtPriceX96', () => {
    it('produces the reciprocal price', () => {
        const sqrtPriceX96 = Q96 * 2n
        const price = computePoolPrice({ sqrtPriceX96, decimals0: 18, decimals1: 18 })
        const inverted = computePoolPrice({
            sqrtPriceX96: invertSqrtPriceX96(sqrtPriceX96),
            decimals0: 18,
            decimals1: 18,
        })
        expect(inverted).toBeCloseTo(1 / price, 9)
    })

    it('round-trips to within integer truncation', () => {
        const sqrtPriceX96 = Q96 * 3n
        const back = invertSqrtPriceX96(invertSqrtPriceX96(sqrtPriceX96))
        const drift = back > sqrtPriceX96 ? back - sqrtPriceX96 : sqrtPriceX96 - back
        expect(drift).toBeLessThan(10n)
    })

    it('guards a zero price', () => {
        expect(invertSqrtPriceX96(0n)).toBe(0n)
    })
})

describe('getPoolDisplayOrder', () => {
    const chainId = CHAIN_IDS.bitkub
    const stable = [...(STABLECOIN_ADDRESSES[chainId] ?? [])][0]!
    const wrapped = WRAPPED_NATIVE_ADDRESSES[chainId]!
    const other = '0x1111111111111111111111111111111111111111'

    it('prefers the stablecoin as quote', () => {
        expect(getPoolDisplayOrder(chainId, other, stable)).toEqual({
            base: other,
            quote: stable,
            invert: false,
        })
        expect(getPoolDisplayOrder(chainId, stable, other)).toEqual({
            base: other,
            quote: stable,
            invert: true,
        })
    })

    it('prefers the stablecoin over wrapped native', () => {
        expect(getPoolDisplayOrder(chainId, stable, wrapped).quote).toBe(stable)
    })

    it('falls back to wrapped native as quote', () => {
        expect(getPoolDisplayOrder(chainId, other, wrapped)).toEqual({
            base: other,
            quote: wrapped,
            invert: false,
        })
        expect(getPoolDisplayOrder(chainId, wrapped, other).invert).toBe(true)
    })

    it('keeps pool order when neither token is special', () => {
        const another = '0x2222222222222222222222222222222222222222'
        expect(getPoolDisplayOrder(chainId, other, another).invert).toBe(false)
    })
})

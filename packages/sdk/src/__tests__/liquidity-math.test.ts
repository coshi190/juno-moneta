import { describe, it, expect } from 'vitest'
import {
    getAmountsForLiquidity,
    calculateAmount1FromAmount0,
    calculateAmount0FromAmount1,
    calculateMinAmounts,
    bigIntSqrt,
} from '../pool/liquidity-math.js'
import { tickToSqrtPriceX96 } from '../pool/tick-math.js'

const sqrtPriceLower = tickToSqrtPriceX96(-1000)
const sqrtPriceUpper = tickToSqrtPriceX96(1000)
const liquidity = 10n ** 18n

describe('getAmountsForLiquidity', () => {
    it('is entirely token0 when price is below the range', () => {
        const result = getAmountsForLiquidity(
            tickToSqrtPriceX96(-2000),
            sqrtPriceLower,
            sqrtPriceUpper,
            liquidity
        )
        expect(result.amount0).toBeGreaterThan(0n)
        expect(result.amount1).toBe(0n)
    })

    it('is entirely token1 when price is above the range', () => {
        const result = getAmountsForLiquidity(
            tickToSqrtPriceX96(2000),
            sqrtPriceLower,
            sqrtPriceUpper,
            liquidity
        )
        expect(result.amount0).toBe(0n)
        expect(result.amount1).toBeGreaterThan(0n)
    })

    it('holds both tokens when price is in range', () => {
        const result = getAmountsForLiquidity(
            tickToSqrtPriceX96(0),
            sqrtPriceLower,
            sqrtPriceUpper,
            liquidity
        )
        expect(result.amount0).toBeGreaterThan(0n)
        expect(result.amount1).toBeGreaterThan(0n)
    })

    it('normalises swapped range bounds', () => {
        const current = tickToSqrtPriceX96(0)
        expect(getAmountsForLiquidity(current, sqrtPriceLower, sqrtPriceUpper, liquidity)).toEqual(
            getAmountsForLiquidity(current, sqrtPriceUpper, sqrtPriceLower, liquidity)
        )
    })
})

describe('calculateAmount1FromAmount0', () => {
    it('returns 0n for a zero input amount', () => {
        expect(
            calculateAmount1FromAmount0(tickToSqrtPriceX96(0), sqrtPriceLower, sqrtPriceUpper, 0n)
        ).toBe(0n)
    })

    it('returns 0n outside the range, where the position is single-sided', () => {
        expect(
            calculateAmount1FromAmount0(
                tickToSqrtPriceX96(-2000),
                sqrtPriceLower,
                sqrtPriceUpper,
                100n
            )
        ).toBe(0n)
        expect(
            calculateAmount1FromAmount0(
                tickToSqrtPriceX96(2000),
                sqrtPriceLower,
                sqrtPriceUpper,
                100n
            )
        ).toBe(0n)
    })

    it('pairs a positive amount in range', () => {
        expect(
            calculateAmount1FromAmount0(
                tickToSqrtPriceX96(0),
                sqrtPriceLower,
                sqrtPriceUpper,
                10n ** 18n
            )
        ).toBeGreaterThan(0n)
    })
})

describe('calculateAmount0FromAmount1', () => {
    it('returns 0n for a zero input amount', () => {
        expect(
            calculateAmount0FromAmount1(tickToSqrtPriceX96(0), sqrtPriceLower, sqrtPriceUpper, 0n)
        ).toBe(0n)
    })

    it('returns 0n outside the range, where the position is single-sided', () => {
        expect(
            calculateAmount0FromAmount1(
                tickToSqrtPriceX96(-2000),
                sqrtPriceLower,
                sqrtPriceUpper,
                100n
            )
        ).toBe(0n)
        expect(
            calculateAmount0FromAmount1(
                tickToSqrtPriceX96(2000),
                sqrtPriceLower,
                sqrtPriceUpper,
                100n
            )
        ).toBe(0n)
    })

    it('pairs a positive amount in range', () => {
        expect(
            calculateAmount0FromAmount1(
                tickToSqrtPriceX96(0),
                sqrtPriceLower,
                sqrtPriceUpper,
                10n ** 18n
            )
        ).toBeGreaterThan(0n)
    })
})

describe('calculateMinAmounts', () => {
    it('applies slippage in basis points to both legs', () => {
        expect(calculateMinAmounts(10000n, 20000n, 100)).toEqual({
            amount0Min: 9900n,
            amount1Min: 19800n,
        })
    })

    it('is a no-op at zero slippage', () => {
        expect(calculateMinAmounts(10000n, 20000n, 0)).toEqual({
            amount0Min: 10000n,
            amount1Min: 20000n,
        })
    })
})

describe('bigIntSqrt', () => {
    it('returns exact roots for perfect squares', () => {
        expect(bigIntSqrt(0n)).toBe(0n)
        expect(bigIntSqrt(1n)).toBe(1n)
        expect(bigIntSqrt(4n)).toBe(2n)
        expect(bigIntSqrt(100n)).toBe(10n)
    })

    it('floors non-perfect squares', () => {
        expect(bigIntSqrt(2n)).toBe(1n)
        expect(bigIntSqrt(3n)).toBe(1n)
        expect(bigIntSqrt(5n)).toBe(2n)
        expect(bigIntSqrt(8n)).toBe(2n)
    })

    it('stays exact at the Q96/Q192 magnitudes graduation relies on', () => {
        expect(bigIntSqrt(2n ** 96n)).toBe(2n ** 48n)
        expect(bigIntSqrt(2n ** 192n)).toBe(2n ** 96n)
    })

    it('throws for negative input', () => {
        expect(() => bigIntSqrt(-1n)).toThrow('square root of negative')
    })
})

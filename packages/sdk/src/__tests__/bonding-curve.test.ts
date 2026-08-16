import { formatEther } from 'viem'
import { describe, it, expect } from 'vitest'
import {
    calculateBuyOutput,
    calculateSellOutput,
    calculateGraduationProgress,
    calculateExactGraduationReserve,
    calculateStableGraduationProgress,
    isReadyToGraduate,
    isSqrtPriceWithinTolerance,
    calculateGraduationSqrtPriceX96,
    INITIAL_TOKEN_SUPPLY,
} from '../launchpad/bonding-curve.js'

describe('calculateBuyOutput', () => {
    it('returns 0n when nativeAmountIn is 0n', () => {
        expect(calculateBuyOutput(0n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('returns 0n when tokenReserve is 0n', () => {
        expect(calculateBuyOutput(100n, 100n, 0n, 500n)).toBe(0n)
    })

    it('returns 0n for negative nativeAmountIn', () => {
        expect(calculateBuyOutput(-1n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('calculates output with 1% fee applied', () => {
        const result = calculateBuyOutput(10000n, 100000n, 800000n, 200000n)
        expect(result).toBeGreaterThan(0n)
    })

    it('charges both the pump fee and the curve fee', () => {
        const nativeIn = 10n ** 18n
        const nativeReserve = 100n * 10n ** 18n
        const tokenReserve = 800_000_000n * 10n ** 18n
        const virtualAmount = 3400n * 10n ** 18n

        const actual = calculateBuyOutput(nativeIn, nativeReserve, tokenReserve, virtualAmount)
        const feeFree = (tokenReserve * nativeIn) / (virtualAmount + nativeReserve + nativeIn)

        expect(actual).toBeLessThan(feeFree)
        const lossBps = Number(((feeFree - actual) * 10000n) / feeFree)
        expect(lossBps).toBeGreaterThan(150)
        expect(lossBps).toBeLessThan(250)
    })
})

describe('calculateSellOutput', () => {
    it('returns 0n when tokenAmountIn is 0n', () => {
        expect(calculateSellOutput(0n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('returns 0n when tokenReserve is 0n', () => {
        expect(calculateSellOutput(100n, 100n, 0n, 500n)).toBe(0n)
    })

    it('returns 0n when nativeReserve is 0n', () => {
        expect(calculateSellOutput(100n, 0n, 1000n, 500n)).toBe(0n)
    })

    it('calculates output with 1% fee applied', () => {
        const result = calculateSellOutput(10000n, 100000n, 800000n, 200000n)
        expect(result).toBeGreaterThan(0n)
    })
})

describe('calculateGraduationProgress', () => {
    it('returns 0 when graduation amount is 0', () => {
        expect(calculateGraduationProgress(100n, INITIAL_TOKEN_SUPPLY, 0n)).toBe(0)
    })

    it('returns 0 when token reserve is 0', () => {
        expect(calculateGraduationProgress(100n, 0n, 4000n)).toBe(0)
    })

    it('calculates percentage correctly using ratio', () => {
        expect(calculateGraduationProgress(1000n, INITIAL_TOKEN_SUPPLY, 4000n)).toBe(25)
        expect(calculateGraduationProgress(2000n, INITIAL_TOKEN_SUPPLY, 4000n)).toBe(50)
    })

    it('caps at 100', () => {
        expect(calculateGraduationProgress(8000n, INITIAL_TOKEN_SUPPLY, 4000n)).toBe(100)
    })
})

describe('calculateExactGraduationReserve', () => {
    it('returns graduationAmount unchanged when virtualAmount is 0', () => {
        const graduationAmount = 4000n * 10n ** 18n
        expect(calculateExactGraduationReserve(0n, graduationAmount)).toBe(graduationAmount)
    })

    it('returns graduationAmount unchanged when graduationAmount is 0', () => {
        expect(calculateExactGraduationReserve(3400n * 10n ** 18n, 0n)).toBe(0n)
    })

    it('solves close to the analytically-derived production estimate (~2369.9 ether)', () => {
        const virtualAmount = 3400n * 10n ** 18n
        const graduationAmount = 4000n * 10n ** 18n
        const result = calculateExactGraduationReserve(virtualAmount, graduationAmount)
        const resultEther = Number(formatEther(result))
        expect(resultEther).toBeGreaterThan(2365)
        expect(resultEther).toBeLessThan(2375)
    })

    it('is always strictly below the nominal graduationAmount ceiling', () => {
        const virtualAmount = 3400n * 10n ** 18n
        const graduationAmount = 4000n * 10n ** 18n
        const result = calculateExactGraduationReserve(virtualAmount, graduationAmount)
        expect(result).toBeGreaterThan(0n)
        expect(result).toBeLessThan(graduationAmount)
    })
})

describe('calculateStableGraduationProgress', () => {
    it('returns 0 when exactTarget is 0', () => {
        expect(calculateStableGraduationProgress(1000n, 0n)).toBe(0)
    })

    it('computes percentage against a fixed (non-shrinking) target', () => {
        const exactTarget = 4000n * 10n ** 18n
        expect(calculateStableGraduationProgress(1000n * 10n ** 18n, exactTarget)).toBe(25)
        expect(calculateStableGraduationProgress(2000n * 10n ** 18n, exactTarget)).toBe(50)
    })

    it('caps at 100 even when nativeReserve exceeds the target', () => {
        const exactTarget = 4000n * 10n ** 18n
        expect(calculateStableGraduationProgress(8000n * 10n ** 18n, exactTarget)).toBe(100)
    })
})

describe('isReadyToGraduate', () => {
    const ONE_ETHER = 10n ** 18n
    const CAP_150 = 150n * ONE_ETHER
    const CAP_200 = 200n * ONE_ETHER

    it('returns false when isGraduated is true', () => {
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN_SUPPLY, CAP_150, true)).toBe(false)
    })

    it('returns false when graduationAmount is 0n', () => {
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN_SUPPLY, 0n, false)).toBe(false)
    })

    it('returns false when nativeReserve is 0 and tokenReserve is positive', () => {
        expect(isReadyToGraduate(0n, INITIAL_TOKEN_SUPPLY, CAP_150, false)).toBe(false)
    })

    it('returns true at the equilibrium point (nativeReserve == cap, tokenReserve == INITIAL_TOKEN_SUPPLY)', () => {
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN_SUPPLY, CAP_150, false)).toBe(true)
    })

    it('returns false one wei below the cap on nativeReserve', () => {
        expect(isReadyToGraduate(CAP_150 - 1n, INITIAL_TOKEN_SUPPLY, CAP_150, false)).toBe(false)
    })

    it('matches the contract for a non-150 cap (regression for the hardcoded-cap bug)', () => {
        expect(isReadyToGraduate(CAP_200, INITIAL_TOKEN_SUPPLY, CAP_200, false)).toBe(true)

        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN_SUPPLY, CAP_200, false)).toBe(false)
    })

    it('returns false when the contract would revert with "not reach graduation cap"', () => {
        expect(isReadyToGraduate(100n * ONE_ETHER, INITIAL_TOKEN_SUPPLY, CAP_150, false)).toBe(
            false
        )
    })

    it('returns true for the stuck-token scenario (past cap, contract sqrt-bug blocks init)', () => {
        const nativeReserve = 4009_500000000000000000n
        const tokenReserve = 461_366_962461691276297068760n
        expect(isReadyToGraduate(nativeReserve, tokenReserve, CAP_150, false)).toBe(true)
    })
})

describe('isSqrtPriceWithinTolerance', () => {
    const TARGET = 1_000_000n

    it('returns false for a non-positive target', () => {
        expect(isSqrtPriceWithinTolerance(1n, 0n, 400n)).toBe(false)
    })

    it('accepts drift in either direction within the band', () => {
        expect(isSqrtPriceWithinTolerance(TARGET + 39_999n, TARGET, 400n)).toBe(true)
        expect(isSqrtPriceWithinTolerance(TARGET - 39_999n, TARGET, 400n)).toBe(true)
    })

    it('is inclusive at the band edge', () => {
        expect(isSqrtPriceWithinTolerance(TARGET + 40_000n, TARGET, 400n)).toBe(true)
    })

    it('rejects one wei past the band', () => {
        expect(isSqrtPriceWithinTolerance(TARGET + 40_001n, TARGET, 400n)).toBe(false)
    })
})

describe('calculateGraduationSqrtPriceX96', () => {
    const tokenAddr = '0x3671E189BFb60fB434A902F2274f6546FCE779db' as `0x${string}`
    const wrappedNative = '0x700D3ba307E1256e509eD3E45D6f9dff441d6907' as `0x${string}`
    const nativeReserve = 4009500000000000000000n
    const tokenReserve = 461366962461691276297068760n

    it('stays non-zero where the contract formula truncated to 0', () => {
        expect(
            calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, nativeReserve, tokenReserve)
        ).toBeGreaterThan(0n)
    })

    it('matches the value the rescue script computed for the stuck token', () => {
        expect(
            calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, nativeReserve, tokenReserve)
        ).toBe(233561602564036164489853658n)
    })

    it('clamps to uint160, the type the pool accepts', () => {
        const result = calculateGraduationSqrtPriceX96(
            tokenAddr,
            wrappedNative,
            nativeReserve,
            tokenReserve
        )
        expect(result).toBeLessThanOrEqual((1n << 160n) - 1n)
    })

    it('inverts the ratio when tokenAddr sorts above wrappedNative', () => {
        const highAddr = '0x99999999990FC47611b74827486218f3398A4abD' as `0x${string}`
        const low = calculateGraduationSqrtPriceX96(
            tokenAddr,
            wrappedNative,
            nativeReserve,
            tokenReserve
        )
        const high = calculateGraduationSqrtPriceX96(
            highAddr,
            wrappedNative,
            nativeReserve,
            tokenReserve
        )
        expect(high).toBeGreaterThan(0n)
        expect(high).not.toBe(low)
    })

    it('throws for zero reserves', () => {
        expect(() =>
            calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, 0n, tokenReserve)
        ).toThrow('Invalid reserves')
        expect(() =>
            calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, nativeReserve, 0n)
        ).toThrow('Invalid reserves')
    })

    it('depends only on the reserve ratio, not its magnitude', () => {
        expect(calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, 1000n, 2000n)).toBe(
            calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, 1000000n, 2000000n)
        )
    })
})

import { describe, it, expect } from 'vitest'
import {
    computeDependentAmount,
    computeInitialSqrtPriceX96,
    planAddLiquidity,
    planIncreaseLiquidity,
    planRemoveLiquidity,
} from '../pool/plan-liquidity'
import { getAmountsForLiquidity } from '../pool/liquidity-math'
import { tickToSqrtPriceX96 } from '../pool/tick-math'
import { priceFromSqrtPriceX96 } from '../pool/pool-tvl-math'

const Q96 = 2n ** 96n
const E18 = 10n ** 18n
const NOW = 1_700_000_000

const tokenA = { address: '0xaaaa000000000000000000000000000000000000', decimals: 18 }
const tokenB = { address: '0xbbbb000000000000000000000000000000000000', decimals: 18 }

describe('computeDependentAmount', () => {
    it('derives the paired amount inside the range', () => {
        const amount = computeDependentAmount({
            sqrtPriceX96: Q96,
            tickLower: -6000,
            tickUpper: 6000,
            amount: E18,
            side: 'token0',
        })
        expect(amount).toBeGreaterThan(0n)
    })

    it('returns 0 when the price sits outside the range', () => {
        expect(
            computeDependentAmount({
                sqrtPriceX96: tickToSqrtPriceX96(20000),
                tickLower: -6000,
                tickUpper: 6000,
                amount: E18,
                side: 'token0',
            })
        ).toBe(0n)
    })

    it('returns 0 for a zero input', () => {
        expect(
            computeDependentAmount({
                sqrtPriceX96: Q96,
                tickLower: -6000,
                tickUpper: 6000,
                amount: 0n,
                side: 'token1',
            })
        ).toBe(0n)
    })

    it('mirrors ticks and sides under invert', () => {
        const poolOriented = computeDependentAmount({
            sqrtPriceX96: tickToSqrtPriceX96(1000),
            tickLower: -6000,
            tickUpper: 3000,
            amount: E18,
            side: 'token1',
        })
        const uiOriented = computeDependentAmount({
            sqrtPriceX96: tickToSqrtPriceX96(1000),
            tickLower: -3000,
            tickUpper: 6000,
            amount: E18,
            side: 'token0',
            invert: true,
        })
        expect(uiOriented).toBe(poolOriented)
    })

    it('is not invariant to invert alone away from tick 0', () => {
        const args = {
            sqrtPriceX96: tickToSqrtPriceX96(1000),
            tickLower: -6000,
            tickUpper: 3000,
            amount: E18,
            side: 'token0' as const,
        }
        expect(computeDependentAmount({ ...args, invert: true })).not.toBe(
            computeDependentAmount(args)
        )
    })

    it('is symmetric under invert at tick 0 with a symmetric range', () => {
        const args = {
            sqrtPriceX96: Q96,
            tickLower: -6000,
            tickUpper: 6000,
            amount: E18,
            side: 'token0' as const,
        }
        expect(computeDependentAmount({ ...args, invert: true })).toBe(computeDependentAmount(args))
    })
})

describe('computeInitialSqrtPriceX96', () => {
    it('round-trips a price', () => {
        const sqrtPriceX96 = computeInitialSqrtPriceX96({
            price: '2',
            decimals0: 18,
            decimals1: 18,
        })
        expect(priceFromSqrtPriceX96(sqrtPriceX96, 18, 18)).toBeCloseTo(2, 6)
    })

    it('inverting yields the reciprocal price', () => {
        const sqrtPriceX96 = computeInitialSqrtPriceX96({
            price: '2',
            decimals0: 18,
            decimals1: 18,
            invert: true,
        })
        expect(priceFromSqrtPriceX96(sqrtPriceX96, 18, 18)).toBeCloseTo(0.5, 6)
    })

    it('is at least as accurate as inverting the ratio in Q96 space', () => {
        const price = '1234.5678'
        const direct = computeInitialSqrtPriceX96({
            price,
            decimals0: 18,
            decimals1: 18,
            invert: true,
        })
        const forward = computeInitialSqrtPriceX96({ price, decimals0: 18, decimals1: 18 })
        const ratioInverted = (Q96 * Q96) / forward
        const target = 1 / parseFloat(price)
        const directErr = Math.abs(priceFromSqrtPriceX96(direct, 18, 18) - target) / target
        const ratioErr = Math.abs(priceFromSqrtPriceX96(ratioInverted, 18, 18) - target) / target
        expect(directErr).toBeLessThanOrEqual(ratioErr)
    })
})

describe('planRemoveLiquidity', () => {
    const base = {
        liquidity: 1_000_000n,
        sqrtPriceX96: Q96,
        tickLower: -6000,
        tickUpper: 6000,
        slippageBps: 50,
        deadlineMinutes: 20,
        nowSeconds: NOW,
    }

    it('takes the requested share of liquidity', () => {
        expect(planRemoveLiquidity({ ...base, percentage: 25 }).liquidity).toBe(250_000n)
        expect(planRemoveLiquidity({ ...base, percentage: 50 }).liquidity).toBe(500_000n)
        expect(planRemoveLiquidity({ ...base, percentage: 100 }).liquidity).toBe(1_000_000n)
    })

    it('matches getAmountsForLiquidity for the removed share', () => {
        const plan = planRemoveLiquidity({ ...base, percentage: 50 })
        const expected = getAmountsForLiquidity(
            Q96,
            tickToSqrtPriceX96(-6000),
            tickToSqrtPriceX96(6000),
            500_000n
        )
        expect(plan.amount0).toBe(expected.amount0)
        expect(plan.amount1).toBe(expected.amount1)
    })

    it('applies the slippage floor', () => {
        const plan = planRemoveLiquidity({ ...base, percentage: 100 })
        expect(plan.amount0Min).toBe((plan.amount0 * 9950n) / 10000n)
        expect(plan.amount1Min).toBe((plan.amount1 * 9950n) / 10000n)
    })

    it('derives a deterministic deadline from nowSeconds', () => {
        expect(planRemoveLiquidity({ ...base, percentage: 10 }).deadline).toBe(
            BigInt(NOW + 20 * 60)
        )
    })
})

describe('planAddLiquidity', () => {
    const base = {
        fee: 3000,
        tickSpacing: 60,
        tickLower: -6000,
        tickUpper: 3000,
        amount0Desired: 5n * E18,
        amount1Desired: 7n * E18,
        slippageBps: 50,
        deadlineMinutes: 20,
        nowSeconds: NOW,
    }

    it('keeps pool order when the caller is already sorted', () => {
        const plan = planAddLiquidity({ ...base, token0: tokenA, token1: tokenB })
        expect(plan.inverted).toBe(false)
        expect(plan.token0).toBe(tokenA.address)
        expect(plan.amount0Desired).toBe(5n * E18)
        expect(plan.tickLower).toBe(-6000)
        expect(plan.tickUpper).toBe(3000)
    })

    it('swaps amounts AND mirrors ticks when the caller order is reversed', () => {
        const plan = planAddLiquidity({ ...base, token0: tokenB, token1: tokenA })
        expect(plan.inverted).toBe(true)
        expect(plan.token0).toBe(tokenA.address)
        expect(plan.amount0Desired).toBe(7n * E18)
        expect(plan.amount1Desired).toBe(5n * E18)
        expect(plan.tickLower).toBe(-3000)
        expect(plan.tickUpper).toBe(6000)
    })

    it('snaps mirrored ticks to the spacing', () => {
        const plan = planAddLiquidity({
            ...base,
            token0: tokenB,
            token1: tokenA,
            tickLower: -6011,
            tickUpper: 3007,
        })
        expect(Math.abs(plan.tickLower % 60)).toBe(0)
        expect(Math.abs(plan.tickUpper % 60)).toBe(0)
    })

    it('omits an initial price unless one is given', () => {
        expect(
            planAddLiquidity({ ...base, token0: tokenA, token1: tokenB }).initialSqrtPriceX96
        ).toBeNull()
        const withPrice = planAddLiquidity({
            ...base,
            token0: tokenA,
            token1: tokenB,
            initialPrice: '2',
        })
        expect(withPrice.initialSqrtPriceX96).not.toBeNull()
        expect(priceFromSqrtPriceX96(withPrice.initialSqrtPriceX96!, 18, 18)).toBeCloseTo(2, 6)
    })

    it('inverts the initial price for a reversed pair', () => {
        const plan = planAddLiquidity({
            ...base,
            token0: tokenB,
            token1: tokenA,
            initialPrice: '2',
        })
        expect(priceFromSqrtPriceX96(plan.initialSqrtPriceX96!, 18, 18)).toBeCloseTo(0.5, 6)
    })
})

describe('planIncreaseLiquidity', () => {
    it('applies slippage and a deterministic deadline', () => {
        const plan = planIncreaseLiquidity({
            tokenId: 42n,
            amount0Desired: 1000n,
            amount1Desired: 2000n,
            slippageBps: 100,
            deadlineMinutes: 10,
            nowSeconds: NOW,
        })
        expect(plan.tokenId).toBe(42n)
        expect(plan.amount0Min).toBe(990n)
        expect(plan.amount1Min).toBe(1980n)
        expect(plan.deadline).toBe(BigInt(NOW + 600))
    })
})

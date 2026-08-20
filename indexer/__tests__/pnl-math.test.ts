import { describe, it, expect } from 'vitest'
import { parseEther, parseUnits } from 'viem'
import type { PnlSwapEvent } from '@coshi190/junoswap-sdk'
import {
    applyFoldEvent,
    finalizeTokenPnl,
    finalizePortfolioPnl,
    foldEventsByToken,
    EMPTY_FOLD,
    type PnlFold,
    type FoldSwapInput,
} from '../src/pnl-math.js'

function fold(events: FoldSwapInput[], decimals = 18): PnlFold {
    return events.reduce((f, e) => applyFoldEvent(f, e, decimals), EMPTY_FOLD)
}

function buy(tokens: number, kub: number, nativeUsd: number): FoldSwapInput {
    return {
        isBuy: true,
        amountIn: parseEther(String(kub)).toString(),
        amountOut: parseEther(String(tokens)).toString(),
        nativeUsd,
    }
}

function sell(tokens: number, kub: number, nativeUsd: number): FoldSwapInput {
    return {
        isBuy: false,
        amountIn: parseEther(String(tokens)).toString(),
        amountOut: parseEther(String(kub)).toString(),
        nativeUsd,
    }
}

describe('pnl-math fold + finalize', () => {
    it('buy-only: unrealized only, no realized', () => {
        const pnl = finalizeTokenPnl(fold([buy(100, 10, 2)]), 100, 0.5)
        expect(pnl.totalInvestedUsd).toBeCloseTo(20)
        expect(pnl.costBasisUsd).toBeCloseTo(20)
        expect(pnl.realizedUsd).toBeCloseTo(0)
        expect(pnl.unrealizedUsd).toBeCloseTo(30)
        expect(pnl.totalPnlUsd).toBeCloseTo(30)
        expect(pnl.pnlPercent).toBeCloseTo(150)
    })

    it('partial sell: realizes proceeds minus avg cost of sold', () => {
        const pnl = finalizeTokenPnl(fold([buy(100, 10, 2), sell(50, 8, 2)]), 50, 0.3)
        expect(pnl.realizedUsd).toBeCloseTo(6)
        expect(pnl.costBasisUsd).toBeCloseTo(10)
        expect(pnl.unrealizedUsd).toBeCloseTo(5)
        expect(pnl.totalPnlUsd).toBeCloseTo(11)
    })

    it('full exit: realized captured with zero remaining position', () => {
        const pnl = finalizeTokenPnl(fold([buy(100, 10, 2), sell(100, 30, 2)]), 0, null)
        expect(pnl.realizedUsd).toBeCloseTo(40)
        expect(pnl.unrealizedUsd).toBeCloseTo(0)
        expect(pnl.totalPnlUsd).toBeCloseTo(40)
    })

    it('values each buy at its historical KUB/USD rate, not the current one', () => {
        const pnl = finalizeTokenPnl(fold([buy(50, 10, 1), buy(50, 10, 3)]), 100, 0.5)
        expect(pnl.totalInvestedUsd).toBeCloseTo(40)
        expect(pnl.costBasisUsd).toBeCloseTo(40)
        expect(pnl.unrealizedUsd).toBeCloseTo(10)
    })

    it('selling more than the accounted position never yields negative basis', () => {
        const pnl = finalizeTokenPnl(fold([buy(50, 10, 2), sell(100, 40, 2)]), 0, null)
        expect(pnl.realizedUsd).toBeCloseTo(60)
        expect(pnl.costBasisUsd).toBeCloseTo(0)
        expect(pnl.unrealizedUsd).toBeCloseTo(0)
    })

    it('decodes the token leg at its real decimals (6-dec USDT), not 18', () => {
        const buyUsdt: FoldSwapInput = {
            isBuy: true,
            amountIn: parseEther('10').toString(),
            amountOut: parseUnits('1000', 6).toString(),
            nativeUsd: 2,
        }
        const pnl = finalizeTokenPnl(fold([buyUsdt], 6), 1000, 1)
        expect(pnl.totalInvestedUsd).toBeCloseTo(20)
        expect(pnl.costBasisUsd).toBeCloseTo(20)
        expect(pnl.unrealizedUsd).toBeCloseTo(980)

        const broken = finalizeTokenPnl(fold([buyUsdt], 18), 1000, 1)
        expect(broken.unrealizedUsd).toBeLessThan(-1e9)
    })

    it('missing price leaves unrealized and total at zero', () => {
        const pnl = finalizeTokenPnl(fold([buy(100, 10, 2)]), 100, null)
        expect(pnl.unrealizedUsd).toBeCloseTo(0)
        expect(pnl.totalPnlUsd).toBeCloseTo(0)
    })

    it('finalizePortfolioPnl rolls closed and open positions into totals', () => {
        const TOKEN = '0xtoken'
        const OTHER = '0xother'
        const folds = new Map<string, PnlFold>([
            [TOKEN, fold([buy(100, 10, 2), sell(100, 30, 2)])],
            [OTHER, fold([buy(100, 10, 2)])],
        ])
        const balances = new Map([[OTHER, 100]])
        const prices = new Map<string, number | null>([[OTHER, 0.5]])

        const { totals } = finalizePortfolioPnl(folds, balances, prices)
        expect(totals.realizedUsd).toBeCloseTo(40)
        expect(totals.unrealizedUsd).toBeCloseTo(30)
        expect(totals.totalPnlUsd).toBeCloseTo(70)
        expect(totals.totalInvestedUsd).toBeCloseTo(40)
    })
})

describe('foldEventsByToken', () => {
    it('folds each token independently regardless of input ordering', () => {
        const events: PnlSwapEvent[] = [
            {
                tokenAddr: '0xAAA',
                isBuy: false,
                amountIn: '1000000000000000000',
                amountOut: '2000000000000000000',
                timestamp: 200,
            },
            {
                tokenAddr: '0xaaa',
                isBuy: true,
                amountIn: '1000000000000000000',
                amountOut: '2000000000000000000',
                timestamp: 100,
            },
        ]

        const folds = foldEventsByToken(events, () => 1)
        const fold = folds.get('0xaaa')

        expect(folds.size).toBe(1)
        expect(fold?.position).toBe(1)
        expect(fold?.totalInvestedUsd).toBe(1)
        expect(fold?.realizedUsd).toBeCloseTo(1.5, 10)
    })
})

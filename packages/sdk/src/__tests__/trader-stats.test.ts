import { describe, it, expect } from 'vitest'
import { parseEther } from 'viem'
import { computeWindowedTraderStats, type LeaderboardSwapEvent } from '../rewards/trader-stats.js'
import type { PnlSwapEvent } from '../pnl/index.js'

describe('rewards/trader-stats', () => {
    const TOKEN = '0xtoken'
    const ALICE = '0xalice'
    const BOB = '0xbob'
    const flatRate = (_t: number) => 2

    function bEvent(tokens: number, kub: number, timestamp: number): PnlSwapEvent {
        return {
            tokenAddr: TOKEN,
            isBuy: true,
            amountIn: parseEther(String(kub)).toString(),
            amountOut: parseEther(String(tokens)).toString(),
            timestamp,
        }
    }
    function sEvent(tokens: number, kub: number, timestamp: number): PnlSwapEvent {
        return {
            tokenAddr: TOKEN,
            isBuy: false,
            amountIn: parseEther(String(tokens)).toString(),
            amountOut: parseEther(String(kub)).toString(),
            timestamp,
        }
    }
    const lb = (e: PnlSwapEvent, sender: string): LeaderboardSwapEvent => ({ ...e, sender })

    it('computeWindowedTraderStats folds in-window swaps, values the net position, isolates addresses', () => {
        const events: LeaderboardSwapEvent[] = [
            lb(bEvent(100, 10, 1), ALICE),
            lb(sEvent(50, 8, 2), ALICE),
            lb(bEvent(200, 30, 1), BOB),
        ]
        const prices = new Map([[TOKEN, 0.3]])
        const stats = computeWindowedTraderStats(events, flatRate, prices)

        expect(stats.get(ALICE)!.pnlUsd).toBeCloseTo(11)
        expect(stats.get(ALICE)!.volumeNative).toBeCloseTo(18)
        expect(stats.get(ALICE)!.tradeCount).toBe(2)
        expect(stats.get(ALICE)!.buyCount).toBe(1)
        expect(stats.get(ALICE)!.sellCount).toBe(1)
        expect(stats.get(BOB)!.volumeNative).toBeCloseTo(30)
        expect(stats.get(ALICE)!.pnlUsd).not.toBeCloseTo(stats.get(BOB)!.pnlUsd)
    })
})

import { describe, it, expect } from 'vitest'
import { parseEther } from 'viem'
import type { PnlSwapEvent } from '@coshi190/juno-moneta-sdk'
import { computeWindowedTraderStats, type LeaderboardSwapEvent } from '../src/trader-stats.js'

describe('trader-stats', () => {
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

    // volume is the native leg and flips sides by direction; summing amountIn both ways adds native to tokens and still looks plausible.
    it('computeWindowedTraderStats folds in-window swaps, values the net position, isolates addresses', () => {
        const events: LeaderboardSwapEvent[] = [
            lb(bEvent(100, 10, 1), ALICE),
            lb(sEvent(50, 8, 2), ALICE),
            lb(bEvent(200, 30, 1), BOB),
        ]
        const prices = new Map([[TOKEN, 0.3]])
        const stats = computeWindowedTraderStats(events, flatRate, prices)

        expect(stats.get(ALICE)!.volumeNative).toBeCloseTo(18)
        expect(stats.get(ALICE)!.tradeCount).toBe(2)
        expect(stats.get(ALICE)!.buyCount).toBe(1)
        expect(stats.get(ALICE)!.sellCount).toBe(1)
        expect(stats.get(BOB)!.volumeNative).toBeCloseTo(30)
    })

    // the only computePoints assertion left in the repo; a missing protocol defaults to junoswap and earns 10x what external volume should.
    it('splits volume by protocol and scores external volume at a tenth of juno volume', () => {
        const events: LeaderboardSwapEvent[] = [
            { ...lb(bEvent(100, 500, 1), ALICE), protocol: 'junoswap' },
            { ...lb(bEvent(100, 5000, 2), ALICE), protocol: 'uniswap' },
        ]
        const stats = computeWindowedTraderStats(events, flatRate, new Map()).get(ALICE)!

        expect(stats.junoVolumeNative).toBeCloseTo(500)
        expect(stats.externalVolumeNative).toBeCloseTo(5000)
        expect(stats.volumeNative).toBeCloseTo(5500)
        expect(stats.points).toBe(20)
    })
})

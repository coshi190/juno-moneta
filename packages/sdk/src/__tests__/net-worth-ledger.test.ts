import { describe, it, expect } from 'vitest'
import {
    reconstructBalanceSteps,
    makeNativePriceAt,
    makePriceAt,
    buildLedgerNetWorthSeries,
    classifyPriceKind,
    digestSwapEvents,
    DAY_SECONDS,
    type LedgerToken,
    type LedgerTokenMeta,
    type PnlSwapEvent,
} from '../portfolio/ledger.js'
import { computeNetWorthHistory, needsPriceHistory } from '../portfolio/net-worth.js'

const NOW = 1_800_000_000
const DAY = 86_400
const WINDOW_START = NOW - DAY

describe('reconstructBalanceSteps', () => {
    it('walks trades backward to recover the balance at each moment', () => {
        const steps = reconstructBalanceSteps(100, [
            { timestamp: NOW - 4_000, delta: -4 },
            { timestamp: NOW - 8_000, delta: 10 },
        ])

        expect(steps).toEqual([
            { fromTs: 0, balance: 94 },
            { fromTs: NOW - 8_000, balance: 104 },
            { fromTs: NOW - 4_000, balance: 100 },
        ])
    })

    it('recovers a zero starting balance for a position opened in-window', () => {
        const steps = reconstructBalanceSteps(50, [{ timestamp: NOW - 10_000, delta: 50 }])
        expect(steps[0]).toEqual({ fromTs: 0, balance: 0 })
        expect(steps[1]).toEqual({ fromTs: NOW - 10_000, balance: 50 })
    })
})

describe('makePriceAt', () => {
    it('returns the last price at or before t', () => {
        const at = makePriceAt(
            [
                { timestamp: 100, price: 1 },
                { timestamp: 200, price: 2 },
            ],
            null
        )
        expect(at(150)).toBe(1)
        expect(at(200)).toBe(2)
        expect(at(500)).toBe(2)
    })

    it('falls back when the series is empty', () => {
        expect(makePriceAt([], 7)(123)).toBe(7)
        expect(makePriceAt([], null)(123)).toBe(0)
    })
})

describe('makeNativePriceAt', () => {
    it('returns the last price at or before t, falling back to the first', () => {
        const at = makeNativePriceAt([
            { timestamp: 100, price: 1 },
            { timestamp: 200, price: 2 },
            { timestamp: 300, price: 3 },
        ])
        expect(at(50)).toBe(1)
        expect(at(100)).toBe(1)
        expect(at(250)).toBe(2)
        expect(at(999)).toBe(3)
    })

    it('returns 0 for an empty series', () => {
        expect(makeNativePriceAt([])(123)).toBe(0)
    })
})

describe('buildLedgerNetWorthSeries', () => {
    const base = {
        nativeUsdPoints: [
            { timestamp: WINDOW_START, price: 1 },
            { timestamp: NOW - 1_000, price: 1 },
        ],
        nativeUsdNow: 1,
        windowStart: WINDOW_START,
        nowSec: NOW,
    }

    it('reflects a position opened mid-window rising after purchase', () => {
        const midpoint = NOW - DAY / 2
        const token: LedgerToken = {
            currentBalance: 100,
            deltas: [{ timestamp: midpoint, delta: 100 }],
            priceKind: 'reconstructed',
            nativePricePoints: [
                { timestamp: midpoint, price: 1 },
                { timestamp: NOW - 1_000, price: 2 },
            ],
            priceUsdNow: 2,
        }

        const series = buildLedgerNetWorthSeries({ ...base, tokens: [token], netWorthNow: 200 })

        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 0 })
        const atBuy = series.find((p) => p.timestamp === midpoint)
        expect(atBuy?.value).toBe(100)
        expect(series[series.length - 1]).toEqual({ timestamp: NOW, value: 200 })
    })

    it('holds a stable position flat and tracks KUB/USD for a native position', () => {
        const stable: LedgerToken = {
            currentBalance: 500,
            deltas: [],
            priceKind: 'stable',
            nativePricePoints: [],
            priceUsdNow: 1,
        }
        const native: LedgerToken = {
            currentBalance: 10,
            deltas: [],
            priceKind: 'native',
            nativePricePoints: [],
            priceUsdNow: 2,
        }
        const series = buildLedgerNetWorthSeries({
            ...base,
            nativeUsdPoints: [
                { timestamp: WINDOW_START, price: 2 },
                { timestamp: NOW - DAY / 2, price: 3 },
            ],
            nativeUsdNow: 3,
            tokens: [stable, native],
            netWorthNow: 530,
        })

        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 520 })
        const mid = series.find((p) => p.timestamp === NOW - DAY / 2)
        expect(mid?.value).toBe(530)
    })

    it('KUB-scales a fallback token with no native price history', () => {
        const token: LedgerToken = {
            currentBalance: 4,
            deltas: [],
            priceKind: 'fallback',
            nativePricePoints: [],
            priceUsdNow: 25,
        }
        const series = buildLedgerNetWorthSeries({
            ...base,
            nativeUsdPoints: [
                { timestamp: WINDOW_START, price: 1 },
                { timestamp: NOW - DAY / 2, price: 2 },
            ],
            nativeUsdNow: 2,
            tokens: [token],
            netWorthNow: 100,
        })

        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 50 })
    })

    it('reconstructed token with empty history degrades to the fallback formula', () => {
        const token: LedgerToken = {
            currentBalance: 2,
            deltas: [],
            priceKind: 'reconstructed',
            nativePricePoints: [],
            priceUsdNow: 10,
        }
        const series = buildLedgerNetWorthSeries({
            ...base,
            nativeUsdPoints: [
                { timestamp: WINDOW_START, price: 1 },
                { timestamp: NOW - 1_000, price: 1 },
            ],
            nativeUsdNow: 1,
            tokens: [token],
            netWorthNow: 20,
        })
        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 20 })
    })

    it('returns empty when net worth or KUB price is non-positive', () => {
        const token: LedgerToken = {
            currentBalance: 1,
            deltas: [],
            priceKind: 'native',
            nativePricePoints: [],
            priceUsdNow: 1,
        }
        expect(buildLedgerNetWorthSeries({ ...base, tokens: [token], netWorthNow: 0 })).toEqual([])
        expect(
            buildLedgerNetWorthSeries({ ...base, nativeUsdNow: 0, tokens: [token], netWorthNow: 5 })
        ).toEqual([])
    })

    it('bounds and orders a dense series, pinning the final point', () => {
        const nativeUsdPoints = Array.from({ length: 1_000 }, (_, i) => ({
            timestamp: WINDOW_START + 20 + i * 80,
            price: 2 + Math.sin(i / 50),
        }))
        const token: LedgerToken = {
            currentBalance: 10,
            deltas: [],
            priceKind: 'native',
            nativePricePoints: [],
            priceUsdNow: 20,
        }
        const series = buildLedgerNetWorthSeries({
            windowStart: WINDOW_START,
            nowSec: NOW,
            nativeUsdPoints,
            nativeUsdNow: 2,
            tokens: [token],
            netWorthNow: 20,
        })

        expect(series.length).toBeLessThanOrEqual(97)
        expect(series[series.length - 1]).toEqual({ timestamp: NOW, value: 20 })
        for (let i = 1; i < series.length; i++) {
            expect(series[i]!.timestamp).toBeGreaterThan(series[i - 1]!.timestamp)
        }
    })
})

describe('classifyPriceKind', () => {
    const BITKUB = 96
    const KKUB = '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5'

    it('treats the native coin and wrapped native as native', () => {
        expect(classifyPriceKind('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', BITKUB)).toBe(
            'native'
        )
        expect(classifyPriceKind(KKUB, BITKUB)).toBe('native')
        expect(classifyPriceKind(KKUB.toLowerCase(), BITKUB)).toBe('native')
    })

    it('recognises every reconciled bitkub stablecoin', () => {
        expect(classifyPriceKind('0x7d984C24d2499D840eB3b7016077164e15E5faA6', BITKUB)).toBe(
            'stable'
        )
        expect(classifyPriceKind('0x21cdc3706b8c7b1836df0e533dd884069521350b', BITKUB)).toBe(
            'stable'
        )
        expect(classifyPriceKind('0x31929a0fd776F971C5dd14bF03e1F9fF69D9c91c', BITKUB)).toBe(
            'stable'
        )
    })

    it('falls back to reconstructed for unknown tokens and chains', () => {
        expect(classifyPriceKind('0x1111111111111111111111111111111111111111', BITKUB)).toBe(
            'reconstructed'
        )
        expect(classifyPriceKind(KKUB, 999_999)).toBe('reconstructed')
    })
})

describe('digestSwapEvents', () => {
    const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const NATIVE = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    const buy: PnlSwapEvent = {
        tokenAddr: TOKEN,
        isBuy: true,
        amountIn: '1000000000000000000',
        amountOut: '5000000000000000000',
        timestamp: NOW - 5_000,
    }

    const tokens: LedgerTokenMeta[] = [
        { address: TOKEN, decimals: 18, priceKind: 'reconstructed' },
        { address: NATIVE, decimals: 18, priceKind: 'native', isNativeCoin: true },
    ]

    it('signs the token leg positive on a buy and negative on a sell', () => {
        const bought = digestSwapEvents([buy], tokens, WINDOW_START, NOW)
        expect(bought.get(TOKEN)).toEqual([{ timestamp: NOW - 5_000, delta: 5 }])

        const sold = digestSwapEvents(
            [
                {
                    ...buy,
                    isBuy: false,
                    amountIn: '5000000000000000000',
                    amountOut: '1000000000000000000',
                },
            ],
            tokens,
            WINDOW_START,
            NOW
        )
        expect(sold.get(TOKEN)).toEqual([{ timestamp: NOW - 5_000, delta: -5 }])
    })

    it('attaches the opposing native leg to the native token', () => {
        const result = digestSwapEvents([buy], tokens, WINDOW_START, NOW)
        expect(result.get(NATIVE)).toEqual([{ timestamp: NOW - 5_000, delta: -1 }])
    })

    it('drops events outside the window and tokens it was not given', () => {
        const outside = digestSwapEvents(
            [
                { ...buy, timestamp: WINDOW_START - 1 },
                { ...buy, timestamp: NOW },
            ],
            tokens,
            WINDOW_START,
            NOW
        )
        expect(outside.get(TOKEN)).toBeUndefined()

        const unknown = digestSwapEvents([buy], [tokens[1]!], WINDOW_START, NOW)
        expect(unknown.get(TOKEN)).toBeUndefined()
    })
})

describe('needsPriceHistory', () => {
    it('is true only for tokens with no intrinsic price rule', () => {
        expect(needsPriceHistory('0x1111111111111111111111111111111111111111', 96)).toBe(true)
        expect(needsPriceHistory('0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5', 96)).toBe(false)
        expect(needsPriceHistory('0x7d984C24d2499D840eB3b7016077164e15E5faA6', 96)).toBe(false)
        expect(needsPriceHistory('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', 96)).toBe(false)
    })
})

describe('computeNetWorthHistory', () => {
    const BITKUB = 96
    const KKUB = '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5'
    const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
    const TOKEN = '0x1111111111111111111111111111111111111111'

    const nativeUsdPoints = [
        { timestamp: WINDOW_START, price: 1 },
        { timestamp: NOW - 1_000, price: 1 },
    ]

    it('matches the hand-wired pipeline exactly for a reconstructed position', () => {
        const midpoint = NOW - DAY / 2
        const series = computeNetWorthHistory({
            chainId: BITKUB,
            tokens: [{ address: TOKEN, decimals: 18, balance: 100, priceUsd: 2 }],
            swapEvents: [],
            nativeUsdPoints,
            nativeUsdNow: 1,
            netWorthNow: 200,
            nowSec: NOW,
            nativePricePointsByToken: new Map([
                [
                    TOKEN,
                    [
                        { timestamp: midpoint, price: 1 },
                        { timestamp: NOW - 1_000, price: 2 },
                    ],
                ],
            ]),
        })

        const expected = buildLedgerNetWorthSeries({
            tokens: [
                {
                    currentBalance: 100,
                    deltas: [],
                    priceKind: 'reconstructed',
                    nativePricePoints: [
                        { timestamp: midpoint, price: 1 },
                        { timestamp: NOW - 1_000, price: 2 },
                    ],
                    priceUsdNow: 2,
                },
            ],
            nativeUsdPoints,
            nativeUsdNow: 1,
            windowStart: WINDOW_START,
            nowSec: NOW,
            netWorthNow: 200,
        })

        expect(series).toEqual(expected)
    })

    it('routes the native leg of a swap onto the native coin', () => {
        const series = computeNetWorthHistory({
            chainId: BITKUB,
            tokens: [
                { address: TOKEN, decimals: 18, balance: 5, priceUsd: 1 },
                { address: NATIVE, decimals: 18, balance: 9, priceUsd: 1 },
                { address: KKUB, decimals: 18, balance: 0, priceUsd: 1 },
            ],
            swapEvents: [
                {
                    tokenAddr: TOKEN,
                    isBuy: true,
                    amountIn: '1000000000000000000',
                    amountOut: '5000000000000000000',
                    timestamp: NOW - 5_000,
                },
            ],
            nativeUsdPoints,
            nativeUsdNow: 1,
            netWorthNow: 14,
            nowSec: NOW,
        })

        expect(series[0]).toEqual({ timestamp: WINDOW_START, value: 10 })
        expect(series[series.length - 1]).toEqual({ timestamp: NOW, value: 14 })
    })

    it('defaults windowStart to one day before nowSec', () => {
        const args = {
            chainId: BITKUB,
            tokens: [{ address: NATIVE, decimals: 18, balance: 10, priceUsd: 1 }],
            swapEvents: [],
            nativeUsdPoints,
            nativeUsdNow: 1,
            netWorthNow: 10,
            nowSec: NOW,
        }
        expect(computeNetWorthHistory(args)).toEqual(
            computeNetWorthHistory({ ...args, windowStart: NOW - DAY_SECONDS })
        )
    })
})

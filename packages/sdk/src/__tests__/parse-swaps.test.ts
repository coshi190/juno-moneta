import { describe, it, expect } from 'vitest'
import { parseV3Swap, parseV2Swap } from '../ponder/parse-swaps'

const WN = '0x67ebd850304c70d983b2d1b93ea79c7cd6c3f6b5'
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const ONE = 1_000_000_000_000_000_000n

describe('parseV3Swap', () => {
    it('reads a buy when native is token0 (token leaves the pool)', () => {
        const p = parseV3Swap(
            {
                tokenAddr: TOKEN.toUpperCase(),
                txFrom: '0xTrader',
                amount0: ONE.toString(),
                amount1: (-5n).toString(),
                token0Addr: WN,
                token1Addr: TOKEN,
                timestamp: 100,
                protocol: 'junoswap',
            },
            WN
        )
        expect(p).toEqual({
            tokenAddr: TOKEN,
            sender: '0xTrader',
            isBuy: true,
            amountIn: ONE.toString(),
            amountOut: '5',
            timestamp: 100,
            protocol: 'junoswap',
        })
    })

    it('resolves the native leg against wrapped native, not token sort order', () => {
        const p = parseV3Swap(
            {
                tokenAddr: TOKEN,
                txFrom: '0xTrader',
                amount0: '7',
                amount1: (-2n * ONE).toString(),
                token0Addr: TOKEN,
                token1Addr: WN,
                timestamp: 200,
                protocol: 'kublerx',
            },
            WN
        )
        expect(p).toMatchObject({
            isBuy: false,
            amountIn: '7',
            amountOut: (2n * ONE).toString(),
            protocol: 'kublerx',
        })
    })

    it('skips token/token pools with no native leg', () => {
        expect(
            parseV3Swap(
                {
                    tokenAddr: TOKEN,
                    txFrom: '0xTrader',
                    amount0: '7',
                    amount1: '9',
                    token0Addr: TOKEN,
                    token1Addr: TOKEN_B,
                    timestamp: 300,
                    protocol: 'kublerx',
                },
                WN
            )
        ).toBeNull()
    })
})

describe('parseV2Swap', () => {
    it('skips token/token pools with no native leg', () => {
        expect(
            parseV2Swap(
                {
                    txFrom: '0xTrader',
                    token0Addr: TOKEN,
                    token1Addr: TOKEN_B,
                    amount0In: ONE.toString(),
                    amount1In: '0',
                    amount0Out: '0',
                    amount1Out: '9',
                    timestamp: 300,
                    protocol: 'diamon',
                },
                WN
            )
        ).toBeNull()
    })
})

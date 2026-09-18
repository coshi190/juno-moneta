import { describe, it, expect } from 'vitest'
import type { Address } from 'viem'
import { getV2Quotes } from '../dex/v2-routes.js'
import { getV3Quotes } from '../dex/v3-routes.js'
import type { ReadClient } from '../dex/multicall.js'
import type { ContractCall } from '../dex/plan-swap.js'

const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address

const KKUB = '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as Address
const KUSDT = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address
const LUMI = '0x95013Dcb6A561e6C003AED9C43Fb8B64008aA361' as Address

const POOL = '0x00000000000000000000000000000000000000ff' as Address

function reply(call: ContractCall): unknown {
    switch (call.functionName) {
        case 'getPair':
        case 'getPool':
            return POOL
        case 'getAmountsOut':
            return (call.args[1] as Address[]).map((_, i) => 10n ** 18n * BigInt(i + 1))
        case 'quoteExactInput':
            return [10n ** 18n, [], [], 0n]
        default:
            return [10n ** 18n, 0n, 0, 0n]
    }
}

const client: ReadClient = {
    async multicall({ contracts }) {
        return contracts.map((call) => ({ status: 'success', result: reply(call) }))
    },
    async readContract(call) {
        return reply(call)
    },
}

const unique = (path: Address[]) => new Set(path.map((t) => t.toLowerCase())).size === path.length

describe('route building never revisits a token', () => {
    it('drops v2 paths that re-enter the wrapped native a native input resolved to', async () => {
        const outcomes = await getV2Quotes(client, {
            chainId: 96,
            tokenIn: NATIVE,
            tokenOut: LUMI,
            amountIn: 10n ** 18n,
            connectors: [KKUB, KUSDT],
            maxHops: 3,
        })

        expect(outcomes.length).toBeGreaterThan(0)
        for (const o of outcomes) expect(unique(o.path)).toBe(true)
    })

    it('drops v2 paths that re-enter the wrapped native a native output resolved to', async () => {
        const outcomes = await getV2Quotes(client, {
            chainId: 96,
            tokenIn: LUMI,
            tokenOut: NATIVE,
            amountIn: 10n ** 18n,
            connectors: [KKUB, KUSDT],
            maxHops: 3,
        })

        expect(outcomes.length).toBeGreaterThan(0)
        for (const o of outcomes) expect(unique(o.path)).toBe(true)
    })

    it('drops v3 paths that re-enter the wrapped native a native input resolved to', async () => {
        const outcomes = await getV3Quotes(client, {
            chainId: 96,
            tokenIn: NATIVE,
            tokenOut: LUMI,
            amountIn: 10n ** 18n,
            connectors: [KKUB, KUSDT],
            maxHops: 3,
        })

        expect(outcomes.length).toBeGreaterThan(0)
        for (const o of outcomes) expect(unique(o.path)).toBe(true)
    })

    it('quotes no route when both endpoints resolve to the same token', async () => {
        const outcomes = await getV2Quotes(client, {
            chainId: 96,
            tokenIn: NATIVE,
            tokenOut: KKUB,
            amountIn: 10n ** 18n,
            connectors: [KKUB, KUSDT],
            maxHops: 3,
        })

        expect(outcomes).toEqual([])
    })
})

import { describe, it, expect } from 'vitest'
import type { Address, Hex } from 'viem'
import { decodeFunctionData } from 'viem'
import { getChains, getWrappedNativeAddress, type ChainSlug } from '../configs/chains.js'
import { ProtocolType } from '../configs/dex.js'
import { UNISWAP_V3_SWAP_ROUTER_ABI } from '../abis/uniswap-v3-swap-router.js'
import {
    NATIVE_TOKEN_ADDRESS,
    getSwapAddress,
    getWrapOperation,
    isNativeToken,
    resolveSwapPath,
    shouldSkipUnwrap,
} from '../dex/native.js'
import { encodeV3Path } from '../dex/plan-swap.js'
import { planSwap, SwapPlanError, type PlanSwapInput } from '../dex/plan-swap.js'
import { buildQuoteCall } from '../dex/quote-call.js'

const CHAINS = getChains()

const NATIVE = NATIVE_TOKEN_ADDRESS
const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const USER = '0x1111111111111111111111111111111111111111' as Address
const DEADLINE = 1_800_000_000

const KKUB = getWrappedNativeAddress(CHAINS.bitkub)!
const WJBC = getWrappedNativeAddress(CHAINS.jbc)!
const WETH_BASE = getWrappedNativeAddress(CHAINS.base)!
const JIBSWAP_WNATIVE = '0x99999999990FC47611b74827486218f3398A4abD' as Address

function base(overrides: Partial<PlanSwapInput> = {}): PlanSwapInput {
    return {
        protocol: ProtocolType.V2,
        chainId: CHAINS.jbc,
        dexId: 'jibswap',
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        amountIn: 1000n,
        amountOutMin: 900n,
        recipient: USER,
        deadline: DEADLINE,
        ...overrides,
    }
}

describe('getWrappedNativeAddress', () => {
    it.each(Object.keys(CHAINS) as ChainSlug[])('covers %s', (slug) => {
        const wrapped = getWrappedNativeAddress(CHAINS[slug])
        expect(wrapped).toMatch(/^0x[0-9a-f]{40}$/)
        expect(isNativeToken(wrapped!)).toBe(false)
    })
})

describe('getSwapAddress', () => {
    it('resolves the native sentinel to the chain wrapped native', () => {
        expect(getSwapAddress(NATIVE, CHAINS.bitkub)).toBe(KKUB)
        expect(getSwapAddress(NATIVE, CHAINS.base)).toBe(WETH_BASE)
    })

    it('prefers an explicit wnative over the chain default', () => {
        expect(getSwapAddress(NATIVE, CHAINS.jbc, JIBSWAP_WNATIVE)).toBe(JIBSWAP_WNATIVE)
    })

    it('passes non-native tokens through untouched', () => {
        expect(getSwapAddress(TOKEN_A, CHAINS.bitkub)).toBe(TOKEN_A)
        expect(getSwapAddress(TOKEN_A, CHAINS.bitkub, KKUB)).toBe(TOKEN_A)
    })

    it('returns the sentinel unchanged on an unconfigured chain', () => {
        expect(getSwapAddress(NATIVE, 1)).toBe(NATIVE)
    })

    it('resolveSwapPath substitutes at both ends of a route', () => {
        const path = resolveSwapPath([NATIVE, TOKEN_A, NATIVE], CHAINS.bitkub)
        expect(path).toEqual([KKUB, TOKEN_A, KKUB])
    })
})

describe('getWrapOperation', () => {
    it('detects wrap and unwrap against the chain wrapped native', () => {
        expect(getWrapOperation(NATIVE, WJBC, CHAINS.jbc)).toBe('wrap')
        expect(getWrapOperation(WJBC, NATIVE, CHAINS.jbc)).toBe('unwrap')
    })

    it('returns null for ordinary pairs', () => {
        expect(getWrapOperation(NATIVE, TOKEN_A, CHAINS.jbc)).toBeNull()
        expect(getWrapOperation(TOKEN_A, TOKEN_B, CHAINS.jbc)).toBeNull()
    })
})

describe('encodeV3Path', () => {
    it('packs tokens with 3-byte fees between them', () => {
        const path = encodeV3Path([TOKEN_A, TOKEN_B], [3000])
        expect(path).toBe(`${TOKEN_A}000bb8${TOKEN_B.slice(2)}`)
    })

    it('rejects a path shorter than 2 tokens', () => {
        expect(() => encodeV3Path([TOKEN_A], [])).toThrow(/at least 2 tokens/)
    })

    it('rejects a fee count that does not match the hops', () => {
        expect(() => encodeV3Path([TOKEN_A, TOKEN_B], [3000, 500])).toThrow(/Fees length/)
    })
})

describe('planSwap — wrap / unwrap', () => {
    it('routes native -> wrapped to a WETH9 deposit carrying value, untagged', () => {
        const plan = planSwap(base({ tokenIn: NATIVE, tokenOut: WJBC }))
        expect(plan.kind).toBe('wrap')
        expect(plan.taggable).toBe(false)
        expect(plan.call.address).toBe(WJBC)
        expect(plan.call.functionName).toBe('deposit')
        expect(plan.call.args).toEqual([])
        expect(plan.call.value).toBe(1000n)
    })

    it('routes wrapped -> native to a WETH9 withdraw with no value', () => {
        const plan = planSwap(base({ tokenIn: WJBC, tokenOut: NATIVE }))
        expect(plan.kind).toBe('unwrap')
        expect(plan.taggable).toBe(false)
        expect(plan.call.functionName).toBe('withdraw')
        expect(plan.call.args).toEqual([1000n])
        expect(plan.call.value).toBeUndefined()
    })
})

describe('planSwap — V2', () => {
    it('token -> token uses swapExactTokensForTokens with no value', () => {
        const plan = planSwap(base())
        expect(plan.call.functionName).toBe('swapExactTokensForTokens')
        expect(plan.call.args).toEqual([1000n, 900n, [TOKEN_A, TOKEN_B], USER, BigInt(DEADLINE)])
        expect(plan.call.value).toBeUndefined()
        expect(plan.taggable).toBe(true)
    })

    it('native -> token uses swapExactETHForTokens and sends amountIn as value', () => {
        const plan = planSwap(base({ tokenIn: NATIVE }))
        expect(plan.call.functionName).toBe('swapExactETHForTokens')
        expect(plan.call.value).toBe(1000n)
        expect(plan.call.args).toEqual([900n, [JIBSWAP_WNATIVE, TOKEN_B], USER, BigInt(DEADLINE)])
    })

    it('substitutes the DEX-specific wnative, not the canonical chain one', () => {
        const path = (planSwap(base({ tokenIn: NATIVE })).call.args[1] as Address[])[0]
        expect(path).toBe(JIBSWAP_WNATIVE)
        expect(path).not.toBe(WJBC)
    })

    it('token -> native uses swapExactTokensForETH where unwrapping is allowed', () => {
        const plan = planSwap(base({ tokenOut: NATIVE }))
        expect(plan.call.functionName).toBe('swapExactTokensForETH')
    })

    it('token -> native stays in tokens on bitkub, where unwrap is skipped', () => {
        expect(shouldSkipUnwrap(CHAINS.bitkub)).toBe(true)
        const plan = planSwap(base({ chainId: CHAINS.bitkub, dexId: 'udonswap', tokenOut: NATIVE }))
        expect(plan.call.functionName).toBe('swapExactTokensForTokens')
        expect(plan.call.args[2]).toEqual([TOKEN_A, KKUB])
    })

    it('forceUnwrapNative overrides the skip policy', () => {
        const plan = planSwap(
            base({
                chainId: CHAINS.bitkub,
                dexId: 'udonswap',
                tokenOut: NATIVE,
                forceUnwrapNative: true,
            })
        )
        expect(plan.call.functionName).toBe('swapExactTokensForETH')
    })

    it('threads a multi-hop path through', () => {
        const plan = planSwap(base({ path: [TOKEN_A, WJBC, TOKEN_B] }))
        expect(plan.call.args[2]).toEqual([TOKEN_A, WJBC, TOKEN_B])
    })

    it('throws when the dex has no V2 config on the chain', () => {
        expect(() => planSwap(base({ chainId: CHAINS.base, dexId: 'jibswap' }))).toThrow(
            SwapPlanError
        )
    })
})

function decodeMulticall(plan: { call: { args: readonly unknown[] } }) {
    const [calls] = plan.call.args as [Hex[]]
    return calls.map((data) => decodeFunctionData({ abi: UNISWAP_V3_SWAP_ROUTER_ABI, data }))
}

describe('planSwap — V3', () => {
    const v3 = (o: Partial<PlanSwapInput> = {}) =>
        base({ protocol: ProtocolType.V3, chainId: CHAINS.base, dexId: 'uniswap', fee: 3000, ...o })

    it('token -> token uses exactInputSingle with the caller fee tier', () => {
        const plan = planSwap(v3({ fee: 500 }))
        expect(plan.call.functionName).toBe('exactInputSingle')
        expect(plan.call.args[0]).toMatchObject({
            tokenIn: TOKEN_A,
            tokenOut: TOKEN_B,
            fee: 500,
            recipient: USER,
            amountIn: 1000n,
            amountOutMinimum: 900n,
            sqrtPriceLimitX96: 0n,
        })
        expect(plan.call.value).toBeUndefined()
    })

    it('throws rather than picking a fee tier when the caller gives none', () => {
        const { fee: _fee, ...noFee } = v3()
        expect(() => planSwap(noFee)).toThrow(SwapPlanError)
    })

    it('native -> token resolves the path and sends value', () => {
        const plan = planSwap(v3({ tokenIn: NATIVE }))
        expect(plan.call.functionName).toBe('exactInputSingle')
        expect(plan.call.args[0]).toMatchObject({ tokenIn: WETH_BASE, recipient: USER })
        expect(plan.call.value).toBe(1000n)
    })

    it('token -> native emits a multicall that swaps to the router then unwraps to the user', () => {
        const plan = planSwap(v3({ tokenOut: NATIVE }))
        expect(plan.call.functionName).toBe('multicall')

        const [swap, unwrap] = decodeMulticall(plan)
        expect(swap!.functionName).toBe('exactInputSingle')
        expect(swap!.args?.[0]).toMatchObject({
            recipient: '0x0000000000000000000000000000000000000002',
        })
        expect(unwrap!.functionName).toBe('unwrapWETH9')
        expect(unwrap!.args).toEqual([900n, USER])
    })

    it('token -> native skips the unwrap leg on bitkub', () => {
        const plan = planSwap(v3({ chainId: CHAINS.bitkub, dexId: 'junoswap', tokenOut: NATIVE }))
        expect(plan.call.functionName).toBe('exactInputSingle')
        expect(plan.call.args[0]).toMatchObject({ tokenOut: KKUB, recipient: USER })
    })

    it('multi-hop uses exactInput with an encoded path', () => {
        const plan = planSwap(v3({ path: [TOKEN_A, WETH_BASE, TOKEN_B], fees: [500, 3000] }))
        expect(plan.call.functionName).toBe('exactInput')
        expect(plan.call.args[0]).toMatchObject({
            path: encodeV3Path([TOKEN_A, WETH_BASE, TOKEN_B], [500, 3000]),
            recipient: USER,
        })
    })

    it('multi-hop to native unwraps via multicall', () => {
        const plan = planSwap(
            v3({ tokenOut: NATIVE, path: [TOKEN_A, TOKEN_B, NATIVE], fees: [500, 3000] })
        )
        expect(plan.call.functionName).toBe('multicall')
        const [swap, unwrap] = decodeMulticall(plan)
        expect(swap!.functionName).toBe('exactInput')
        expect(unwrap!.functionName).toBe('unwrapWETH9')
    })
})

describe('buildQuoteCall', () => {
    it('quotes V2 via getAmountsOut on the resolved path', () => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V2,
            chainId: CHAINS.jbc,
            dexId: 'jibswap',
            tokenIn: NATIVE,
            tokenOut: TOKEN_B,
            amountIn: 1000n,
        })
        expect(call?.functionName).toBe('getAmountsOut')
        expect(call?.args).toEqual([1000n, [JIBSWAP_WNATIVE, TOKEN_B]])
    })

    it('quotes V3 single hop via quoteExactInputSingle', () => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V3,
            chainId: CHAINS.base,
            dexId: 'uniswap',
            tokenIn: TOKEN_A,
            tokenOut: TOKEN_B,
            amountIn: 1000n,
            fee: 500,
        })
        expect(call?.functionName).toBe('quoteExactInputSingle')
        expect(call?.args[0]).toMatchObject({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, fee: 500 })
    })

    it('quotes a direct route at the tier its fees carry, not a default', () => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V3,
            chainId: CHAINS.base,
            dexId: 'uniswap',
            tokenIn: TOKEN_A,
            tokenOut: TOKEN_B,
            amountIn: 1000n,
            path: [TOKEN_A, TOKEN_B],
            fees: [100],
        })
        expect(call?.functionName).toBe('quoteExactInputSingle')
        expect(call?.args[0]).toMatchObject({ fee: 100 })
    })

    it('returns undefined for a V3 single hop with no fee tier', () => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V3,
            chainId: CHAINS.base,
            dexId: 'uniswap',
            tokenIn: TOKEN_A,
            tokenOut: TOKEN_B,
            amountIn: 1000n,
        })
        expect(call).toBeUndefined()
    })

    it('returns undefined when the dex is not configured on the chain', () => {
        const call = buildQuoteCall({
            protocol: ProtocolType.V2,
            chainId: CHAINS.base,
            dexId: 'jibswap',
            tokenIn: TOKEN_A,
            tokenOut: TOKEN_B,
            amountIn: 1000n,
        })
        expect(call).toBeUndefined()
    })
})

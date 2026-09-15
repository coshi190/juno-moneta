import type { Abi, Address } from 'viem'
import { V2_ROUTER_ABI } from '../abis/v2-router.js'
import { V3_QUOTER_V2_ABI } from '../abis/v3-quoter.js'
import { findDex, type Protocol, type DEXType } from '../configs/dex.js'
import { encodeV3Path, type ContractCall } from './plan-swap.js'
import * as native from './native.js'
import { batchRead, type ReadClient } from './multicall.js'

interface QuoteCallInput {
    protocol: Protocol
    chainId: number
    dexId?: DEXType
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    path?: Address[]
    fees?: number[]
    fee?: number
}

export function buildQuoteCall(input: QuoteCallInput): ContractCall | undefined {
    const { protocol, chainId, dexId, tokenIn, tokenOut, amountIn } = input

    if (protocol === 'v2') {
        const config = findDex(chainId, dexId, 'v2')
        if (!config) return undefined
        return {
            address: config.router,
            abi: V2_ROUTER_ABI as Abi,
            functionName: 'getAmountsOut',
            args: [
                amountIn,
                native.resolveSwapPath(input.path ?? [tokenIn, tokenOut], chainId, config.wnative),
            ],
        }
    }

    const config = findDex(chainId, dexId, 'v3')
    if (!config) return undefined

    if (input.path && input.path.length > 2 && input.fees) {
        return {
            address: config.quoter,
            abi: V3_QUOTER_V2_ABI as Abi,
            functionName: 'quoteExactInput',
            args: [encodeV3Path(native.resolveSwapPath(input.path, chainId), input.fees), amountIn],
        }
    }

    const fee = input.fee ?? input.fees?.[0]
    if (fee === undefined) return undefined

    return {
        address: config.quoter,
        abi: V3_QUOTER_V2_ABI as Abi,
        functionName: 'quoteExactInputSingle',
        args: [
            {
                tokenIn: native.getSwapAddress(tokenIn, chainId),
                tokenOut: native.getSwapAddress(tokenOut, chainId),
                amountIn,
                fee,
                sqrtPriceLimitX96: 0n,
            },
        ],
    }
}

export interface QuoteResult {
    amountOut: bigint
    sqrtPriceX96After: bigint
    initializedTicksCrossed: number
    gasEstimate: bigint
}

export function fromQuoterV2(
    tuple: readonly [bigint, bigint, number | bigint, bigint]
): QuoteResult {
    return {
        amountOut: tuple[0],
        sqrtPriceX96After: tuple[1],
        initializedTicksCrossed: Number(tuple[2]),
        gasEstimate: tuple[3],
    }
}

export function fromAmountsOut(amounts: readonly bigint[], gasEstimate = 150000n): QuoteResult {
    return {
        amountOut: amounts[amounts.length - 1] ?? 0n,
        sqrtPriceX96After: 0n,
        initializedTicksCrossed: 0,
        gasEstimate,
    }
}

const REFERENCE_DIVISOR = 1000n

function computePriceImpactPercent(
    fullAmountOut: bigint,
    amountIn: bigint,
    referenceAmountOut: bigint,
    referenceAmountIn: bigint
): number | undefined {
    if (referenceAmountOut <= 0n || referenceAmountIn <= 0n || amountIn <= 0n) return undefined
    const num = fullAmountOut * referenceAmountIn
    const den = amountIn * referenceAmountOut
    const ratioBps = Number((num * 10000n) / den)
    return Math.max(0, (10000 - ratioBps) / 100)
}

interface ReferencedQuote<T> {
    target: T
    quote: QuoteResult | null
    priceImpact: number | undefined
    error: Error | null
}

export async function quoteWithReference<T>(
    client: ReadClient,
    amountIn: bigint,
    targets: readonly T[],
    buildCall: (target: T, amount: bigint) => ContractCall | undefined,
    decode: (raw: unknown, target: T) => QuoteResult,
    opts: { withReference?: boolean } = {}
): Promise<ReferencedQuote<T>[]> {
    const referenceAmountIn = amountIn / REFERENCE_DIVISOR
    const withReference = (opts.withReference ?? true) && referenceAmountIn > 0n

    const calls: ContractCall[] = []
    const entries = targets.flatMap((target) => {
        const call = buildCall(target, amountIn)
        if (!call) return []
        const index = calls.length
        calls.push(call)
        if (withReference) calls.push(buildCall(target, referenceAmountIn)!)
        return [{ target, index }]
    })

    const results = await batchRead(client, calls)

    return entries.map(({ target, index }) => {
        const result = results[index]
        if (result?.status !== 'success') {
            return { target, quote: null, priceImpact: undefined, error: result?.error ?? null }
        }

        const refResult = withReference ? results[index + 1] : undefined
        const quote = decode(result.result, target)
        const referenceAmountOut =
            refResult?.status === 'success' ? decode(refResult.result, target).amountOut : 0n

        return {
            target,
            quote,
            priceImpact: computePriceImpactPercent(
                quote.amountOut,
                amountIn,
                referenceAmountOut,
                referenceAmountIn
            ),
            error: null,
        }
    })
}

export interface QuoteParams {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    dexId?: DEXType | DEXType[]
}

export interface RouteQuoteParams extends QuoteParams {
    connectors: Address[]
    maxHops?: number
    maxRouteQuotes?: number
    withPriceImpact?: boolean
}

export function sortByAmountOut<T extends { quote: QuoteResult | null }>(outcomes: T[]): T[] {
    return outcomes.sort((a, b) => {
        if (!a.quote || !b.quote) return a.quote ? -1 : b.quote ? 1 : 0
        if (a.quote.amountOut === b.quote.amountOut) return 0
        return a.quote.amountOut > b.quote.amountOut ? -1 : 1
    })
}

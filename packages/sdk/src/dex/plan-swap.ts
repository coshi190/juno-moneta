import {
    encodeAbiParameters,
    encodeFunctionData,
    concat,
    pad,
    toHex,
    type Abi,
    type Address,
    type Hex,
} from 'viem'
import { AGG_ROUTER_JUNOSWAP_ABI } from '../abis/agg-router-junoswap.js'
import { V2_ROUTER_ABI } from '../abis/v2-router.js'
import { V3_SWAP_ROUTER_ABI } from '../abis/v3-swap-router.js'
import { WETH9_ABI } from '../abis/weth9.js'
import { getAggRouterDeployment } from '../configs/deployments.js'
import { findDex, type Protocol, type DEXType } from '../configs/dex.js'
import { appendTrackingTag, DEFAULT_REFERRER } from '../rewards/tracking.js'
import { getWrappedNativeAddress } from '../configs/chains.js'
import type { AggregatePlan } from './aggregate-plan.js'
import * as native from './native.js'

export interface ContractCall {
    address: Address
    abi: Abi
    functionName: string
    args: readonly unknown[]
    value?: bigint
}

export type SwapKind = 'swap' | 'wrap' | 'unwrap'

export interface SwapPlan {
    kind: SwapKind
    call: ContractCall
    taggable: boolean
    data: Hex
}

type PlannedCall = Omit<SwapPlan, 'data'>

interface SwapInputBase {
    chainId: number
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    amountOutMin: bigint
    recipient: Address
    deadline: number
    referrer?: Address | null
}

export interface DirectSwapInput extends SwapInputBase {
    protocol: Protocol
    dexId?: DEXType
    path?: Address[]
    fees?: number[]
    fee?: number
    forceUnwrapNative?: boolean
    aggregate?: undefined
}

export interface AggregateSwapInput extends SwapInputBase {
    aggregate: AggregatePlan
}

export type PlanSwapInput = DirectSwapInput | AggregateSwapInput

export class SwapPlanError extends Error {}

const ADDRESS_THIS: Address = '0x0000000000000000000000000000000000000002'

interface V3ExactInputSingleParams {
    tokenIn: Address
    tokenOut: Address
    fee: number
    recipient: Address
    amountIn: bigint
    amountOutMinimum: bigint
    sqrtPriceLimitX96: bigint
}

interface V3ExactInputParams {
    path: Hex
    recipient: Address
    amountIn: bigint
    amountOutMinimum: bigint
}

export function encodeV3Path(tokens: Address[], fees: number[]): Hex {
    if (tokens.length < 2) throw new Error('Path must have at least 2 tokens')
    if (fees.length !== tokens.length - 1) throw new Error('Fees length must be tokens.length - 1')

    const parts: Hex[] = []
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (!token) throw new Error(`Token at index ${i} is undefined`)
        parts.push(token.toLowerCase() as Hex)

        if (i < fees.length) {
            const fee = fees[i]
            if (fee === undefined) throw new Error(`Fee at index ${i} is undefined`)
            parts.push(pad(toHex(fee), { size: 3 }))
        }
    }
    return concat(parts)
}

function encodeExactInputSingle(params: V3ExactInputSingleParams): Hex {
    return encodeFunctionData({
        abi: V3_SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [params],
    })
}

function encodeExactInput(params: V3ExactInputParams): Hex {
    return encodeFunctionData({
        abi: V3_SWAP_ROUTER_ABI,
        functionName: 'exactInput',
        args: [params],
    })
}

function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: V3_SWAP_ROUTER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountMinimum, recipient],
    })
}

export function planSwap(input: PlanSwapInput): SwapPlan {
    const plan = buildPlan(input)
    const data = encodeFunctionData({
        abi: plan.call.abi,
        functionName: plan.call.functionName,
        args: plan.call.args,
    })
    return {
        ...plan,
        data: plan.taggable ? appendTrackingTag(data, input.referrer ?? null) : data,
    }
}

function buildPlan(input: PlanSwapInput): PlannedCall {
    if (input.aggregate) return planAggregateSwap(input)

    const wrapOperation = native.getWrapOperation(input.tokenIn, input.tokenOut, input.chainId)
    if (wrapOperation) return planWrap(wrapOperation, input.chainId, input.amountIn)

    return input.protocol === 'v2' ? planV2Swap(input) : planV3Swap(input)
}

function planWrap(operation: 'wrap' | 'unwrap', chainId: number, amountIn: bigint): PlannedCall {
    const wrapped = getWrappedNativeAddress(chainId)
    if (!wrapped) {
        throw new SwapPlanError(`No wrapped native token configured for chain ${chainId}`)
    }

    return {
        kind: operation,
        taggable: false,
        call:
            operation === 'wrap'
                ? {
                      address: wrapped,
                      abi: WETH9_ABI as Abi,
                      functionName: 'deposit',
                      args: [],
                      value: amountIn,
                  }
                : {
                      address: wrapped,
                      abi: WETH9_ABI as Abi,
                      functionName: 'withdraw',
                      args: [amountIn],
                  },
    }
}

function planV2Swap(input: DirectSwapInput): PlannedCall {
    const { chainId, dexId, tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline } = input

    const config = findDex(chainId, dexId, 'v2')
    if (!config) {
        throw new SwapPlanError(
            dexId === undefined
                ? `No V2 dex on chain ${chainId}`
                : `No V2 config for dex "${dexId}" on chain ${chainId}`
        )
    }

    const path = native.resolveSwapPath(input.path ?? [tokenIn, tokenOut], chainId, config.wnative)
    const nativeIn = native.isNativeToken(tokenIn)
    const unwrapOut = native.isNativeToken(tokenOut) && !skipsUnwrap(input)
    const deadlineArg = BigInt(deadline)

    const call = (
        functionName: string,
        args: readonly unknown[],
        value?: bigint
    ): ContractCall => ({
        address: config.router,
        abi: V2_ROUTER_ABI as Abi,
        functionName,
        args,
        value,
    })

    if (nativeIn) {
        return {
            kind: 'swap',
            taggable: true,
            call: call(
                'swapExactETHForTokens',
                [amountOutMin, path, recipient, deadlineArg],
                amountIn
            ),
        }
    }

    return {
        kind: 'swap',
        taggable: true,
        call: call(unwrapOut ? 'swapExactTokensForETH' : 'swapExactTokensForTokens', [
            amountIn,
            amountOutMin,
            path,
            recipient,
            deadlineArg,
        ]),
    }
}

function planV3Swap(input: DirectSwapInput): PlannedCall {
    const { chainId, dexId, tokenIn, tokenOut, amountIn, amountOutMin, recipient } = input

    const config = findDex(chainId, dexId, 'v3')
    if (!config) {
        throw new SwapPlanError(
            dexId === undefined
                ? `No V3 dex on chain ${chainId}`
                : `No V3 config for dex "${dexId}" on chain ${chainId}`
        )
    }

    const unwrapOut = native.isNativeToken(tokenOut) && !skipsUnwrap(input)
    const value = native.isNativeToken(tokenIn) ? amountIn : undefined

    const swapRecipient = unwrapOut ? ADDRESS_THIS : recipient
    const base = { address: config.swapRouter, abi: V3_SWAP_ROUTER_ABI as Abi, value }

    const withUnwrap = (swapCalldata: Hex): ContractCall => ({
        ...base,
        functionName: 'multicall',
        args: [[swapCalldata, encodeUnwrapWETH9(amountOutMin, recipient)]],
    })

    if (input.path && input.path.length > 2 && input.fees) {
        const params = {
            path: encodeV3Path(native.resolveSwapPath(input.path, chainId), input.fees),
            recipient: swapRecipient,
            amountIn,
            amountOutMinimum: amountOutMin,
        }
        const call = unwrapOut
            ? withUnwrap(encodeExactInput(params))
            : { ...base, functionName: 'exactInput', args: [params] }
        return { kind: 'swap', taggable: true, call }
    }

    if (input.fee === undefined) {
        throw new SwapPlanError('V3 single-hop swap requires a fee tier')
    }

    const params = {
        tokenIn: native.getSwapAddress(tokenIn, chainId),
        tokenOut: native.getSwapAddress(tokenOut, chainId),
        fee: input.fee,
        recipient: swapRecipient,
        amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
    }
    const call = unwrapOut
        ? withUnwrap(encodeExactInputSingle(params))
        : { ...base, functionName: 'exactInputSingle', args: [params] }
    return { kind: 'swap', taggable: true, call }
}

function skipsUnwrap(input: DirectSwapInput): boolean {
    return !input.forceUnwrapNative && native.shouldSkipUnwrap(input.chainId)
}

interface EncodedHop {
    factory: Address
    swapData: Hex
}

function encodeHopSwapData(tokenOut: Address, fee?: number): Hex {
    if (fee === undefined) {
        return encodeAbiParameters([{ type: 'address' }], [tokenOut])
    }
    return encodeAbiParameters([{ type: 'address' }, { type: 'uint24' }], [tokenOut, fee])
}

function encodeHops(hops: AggregatePlan['legs'][number]['hops']): EncodedHop[] {
    if (hops.length === 0) throw new SwapPlanError('Aggregate leg has no hops')
    return hops.map((h, i) => {
        if (h.tokenIn.toLowerCase() === h.tokenOut.toLowerCase()) {
            throw new SwapPlanError(`Hop ${i} resolves to the same token`)
        }
        const isV3 = h.protocol === 'v3'
        if (isV3 && h.fee === undefined) throw new SwapPlanError(`V3 hop ${i} requires a fee tier`)
        return {
            factory: h.factory,
            swapData: encodeHopSwapData(h.tokenOut, isV3 ? h.fee : undefined),
        }
    })
}

function planAggregateSwap(input: AggregateSwapInput): PlannedCall {
    const { chainId, tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline } = input
    const plan = input.aggregate

    const router = getAggRouterDeployment(chainId)?.address
    if (!router) throw new SwapPlanError(`No aggregation router deployed on chain ${chainId}`)
    if (plan.legs.length === 0) throw new SwapPlanError('Aggregate swap has no legs')

    const total = plan.legs.reduce((sum, leg) => sum + leg.amountIn, 0n)
    if (total !== amountIn) throw new SwapPlanError(`Legs sum to ${total}, expected ${amountIn}`)

    const legs = plan.legs.map((leg) => ({
        amountIn: leg.amountIn,
        hops: encodeHops(leg.hops),
    }))

    const params = {
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut: amountOutMin,
        recipient,
        deadline: BigInt(deadline),
        unwrapOut: native.isNativeToken(tokenOut) && !native.shouldSkipUnwrap(chainId),
        referrer: input.referrer ?? DEFAULT_REFERRER,
    }

    return {
        kind: 'swap',
        taggable: true,
        call: {
            address: router,
            abi: AGG_ROUTER_JUNOSWAP_ABI as Abi,
            functionName: 'aggregate',
            args: [params, legs],
            value: native.isNativeToken(tokenIn) ? amountIn : undefined,
        },
    }
}

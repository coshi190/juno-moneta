import { encodeFunctionData, concat, pad, toHex, type Abi, type Address, type Hex } from 'viem'
import { UNISWAP_V2_ROUTER_ABI } from '../abis/uniswap-v2-router.js'
import { UNISWAP_V3_SWAP_ROUTER_ABI } from '../abis/uniswap-v3-swap-router.js'
import { WETH9_ABI } from '../abis/weth9.js'
import { getDexConfig, ProtocolType, type DEXType } from '../configs/dex.js'
import { appendTrackingTag } from '../rewards/tracking.js'
import { getWrappedNativeAddress } from '../configs/chains.js'
import {
    getSwapAddress,
    getWrapOperation,
    isNativeToken,
    resolveSwapPath,
    shouldSkipUnwrap,
} from './native.js'

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
}

export interface PlanSwapInput {
    protocol: ProtocolType
    chainId: number
    dexId?: DEXType
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    amountOutMin: bigint
    recipient: Address
    deadline: number
    path?: Address[]
    fees?: number[]
    fee?: number
    forceUnwrapNative?: boolean
}

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
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [params],
    })
}

function encodeExactInput(params: V3ExactInputParams): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInput',
        args: [params],
    })
}

function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountMinimum, recipient],
    })
}

export function planSwap(input: PlanSwapInput): SwapPlan {
    const { chainId, tokenIn, tokenOut, amountIn } = input

    const wrapOperation = getWrapOperation(tokenIn, tokenOut, chainId)
    if (wrapOperation) return planWrap(wrapOperation, chainId, amountIn)

    return input.protocol === ProtocolType.V2 ? planV2Swap(input) : planV3Swap(input)
}

function planWrap(operation: 'wrap' | 'unwrap', chainId: number, amountIn: bigint): SwapPlan {
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

function planV2Swap(input: PlanSwapInput): SwapPlan {
    const { chainId, dexId, tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline } = input

    const config = getDexConfig(chainId, dexId, ProtocolType.V2)
    if (!config) {
        throw new SwapPlanError(`No V2 config for dex "${dexId ?? 'junoswap'}" on chain ${chainId}`)
    }

    const path = resolveSwapPath(input.path ?? [tokenIn, tokenOut], chainId, config.wnative)
    const nativeIn = isNativeToken(tokenIn)
    const unwrapOut = isNativeToken(tokenOut) && !skipsUnwrap(input)
    const deadlineArg = BigInt(deadline)

    const call = (
        functionName: string,
        args: readonly unknown[],
        value?: bigint
    ): ContractCall => ({
        address: config.router,
        abi: UNISWAP_V2_ROUTER_ABI as Abi,
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

function planV3Swap(input: PlanSwapInput): SwapPlan {
    const { chainId, dexId, tokenIn, tokenOut, amountIn, amountOutMin, recipient } = input

    const config = getDexConfig(chainId, dexId, ProtocolType.V3)
    if (!config) {
        throw new SwapPlanError(`No V3 config for dex "${dexId ?? 'junoswap'}" on chain ${chainId}`)
    }

    const unwrapOut = isNativeToken(tokenOut) && !skipsUnwrap(input)
    const value = isNativeToken(tokenIn) ? amountIn : undefined

    const swapRecipient = unwrapOut ? ADDRESS_THIS : recipient
    const base = { address: config.swapRouter, abi: UNISWAP_V3_SWAP_ROUTER_ABI as Abi, value }

    const withUnwrap = (swapCalldata: Hex): ContractCall => ({
        ...base,
        functionName: 'multicall',
        args: [[swapCalldata, encodeUnwrapWETH9(amountOutMin, recipient)]],
    })

    if (input.path && input.path.length > 2 && input.fees) {
        const params = {
            path: encodeV3Path(resolveSwapPath(input.path, chainId), input.fees),
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
        tokenIn: getSwapAddress(tokenIn, chainId),
        tokenOut: getSwapAddress(tokenOut, chainId),
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

function skipsUnwrap(input: PlanSwapInput): boolean {
    return !input.forceUnwrapNative && shouldSkipUnwrap(input.chainId)
}

export function encodeSwapCalldata(plan: SwapPlan, referrer: Address): Hex {
    const data = encodeFunctionData({
        abi: plan.call.abi,
        functionName: plan.call.functionName,
        args: plan.call.args,
    })
    return plan.taggable ? appendTrackingTag(data, referrer) : data
}

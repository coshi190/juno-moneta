import { encodeFunctionData, type Abi, type Address, type Hex } from 'viem'
import { UNISWAP_V2_ROUTER_ABI, UNISWAP_V3_SWAP_ROUTER_ABI, WETH9_ABI } from '../abis/index.js'
import {
    DEFAULT_FEE_TIER,
    ProtocolType,
    getV2Config,
    getV3Config,
    type DEXType,
} from '../configs/dex-config.js'
import { appendTrackingTag } from '../rewards/tracking.js'
import {
    getSwapAddress,
    getWrapOperation,
    getWrappedNativeAddress,
    isNativeToken,
    resolveSwapPath,
    shouldSkipUnwrap,
} from './native.js'
import {
    ADDRESS_THIS,
    encodeExactInput,
    encodeExactInputSingle,
    encodeUnwrapWETH9,
    encodeV3Path,
} from './uniswap-v3.js'

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

    const config = getV2Config(chainId, dexId)
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

    const config = getV3Config(chainId, dexId)
    if (!config) {
        throw new SwapPlanError(`No V3 config for dex "${dexId ?? 'junoswap'}" on chain ${chainId}`)
    }

    const unwrapOut = isNativeToken(tokenOut) && !skipsUnwrap(input)
    const value = isNativeToken(tokenIn) ? amountIn : undefined
    const fee = input.fee ?? config.defaultFeeTier ?? DEFAULT_FEE_TIER

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

    const params = {
        tokenIn: getSwapAddress(tokenIn, chainId),
        tokenOut: getSwapAddress(tokenOut, chainId),
        fee,
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

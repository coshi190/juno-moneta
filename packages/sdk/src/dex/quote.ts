import type { Abi, Address } from 'viem'
import { UNISWAP_V2_ROUTER_ABI, UNISWAP_V3_QUOTER_V2_ABI } from '../abis/index.js'
import {
    DEFAULT_FEE_TIER,
    ProtocolType,
    getV2Config,
    getV3Config,
    type DEXType,
} from '../configs/dex-config.js'
import type { ContractCall } from './plan-swap.js'
import { getSwapAddress, resolveSwapPath } from './native.js'
import { encodeV3Path } from './uniswap-v3.js'

export interface QuoteCallInput {
    protocol: ProtocolType
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

    if (protocol === ProtocolType.V2) {
        const config = getV2Config(chainId, dexId)
        if (!config) return undefined
        return {
            address: config.router,
            abi: UNISWAP_V2_ROUTER_ABI as Abi,
            functionName: 'getAmountsOut',
            args: [
                amountIn,
                resolveSwapPath(input.path ?? [tokenIn, tokenOut], chainId, config.wnative),
            ],
        }
    }

    const config = getV3Config(chainId, dexId)
    if (!config) return undefined

    if (input.path && input.path.length > 2 && input.fees) {
        return {
            address: config.quoter,
            abi: UNISWAP_V3_QUOTER_V2_ABI as Abi,
            functionName: 'quoteExactInput',
            args: [encodeV3Path(resolveSwapPath(input.path, chainId), input.fees), amountIn],
        }
    }

    return {
        address: config.quoter,
        abi: UNISWAP_V3_QUOTER_V2_ABI as Abi,
        functionName: 'quoteExactInputSingle',
        args: [
            {
                tokenIn: getSwapAddress(tokenIn, chainId),
                tokenOut: getSwapAddress(tokenOut, chainId),
                amountIn,
                fee: input.fee ?? config.defaultFeeTier ?? DEFAULT_FEE_TIER,
                sqrtPriceLimitX96: 0n,
            },
        ],
    }
}

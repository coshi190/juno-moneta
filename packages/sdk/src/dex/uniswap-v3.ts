import { encodeFunctionData, concat, pad, toHex, type Address, type Hex } from 'viem'
import { UNISWAP_V3_SWAP_ROUTER_ABI } from '../abis/index.js'

export const ADDRESS_THIS: Address = '0x0000000000000000000000000000000000000002'

export interface V3ExactInputSingleParams {
    tokenIn: Address
    tokenOut: Address
    fee: number
    recipient: Address
    amountIn: bigint
    amountOutMinimum: bigint
    sqrtPriceLimitX96: bigint
}

export interface V3ExactInputParams {
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

export function encodeExactInputSingle(params: V3ExactInputSingleParams): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [params],
    })
}

export function encodeExactInput(params: V3ExactInputParams): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInput',
        args: [params],
    })
}

export function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountMinimum, recipient],
    })
}

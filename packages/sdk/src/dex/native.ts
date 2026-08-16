import type { Address } from 'viem'
import { CHAIN_IDS, WRAPPED_NATIVE_ADDRESSES } from '../configs/chains.js'

export const NATIVE_TOKEN_ADDRESS: Address = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

export function isNativeToken(address: Address): boolean {
    return address.toLowerCase() === NATIVE_TOKEN_ADDRESS
}

export function getWrappedNativeAddress(chainId: number): Address | undefined {
    return WRAPPED_NATIVE_ADDRESSES[chainId]
}

export function getSwapAddress(token: Address, chainId: number, wnative?: Address): Address {
    if (!isNativeToken(token)) return token
    return wnative ?? WRAPPED_NATIVE_ADDRESSES[chainId] ?? token
}

export function resolveSwapPath(tokens: Address[], chainId: number, wnative?: Address): Address[] {
    return tokens.map((token) => getSwapAddress(token, chainId, wnative))
}

export function isWrappedNative(token: Address, chainId: number, wnative?: Address): boolean {
    const wrapped = wnative ?? WRAPPED_NATIVE_ADDRESSES[chainId]
    if (!wrapped) return false
    return token.toLowerCase() === wrapped.toLowerCase()
}

export function getWrapOperation(
    tokenIn: Address,
    tokenOut: Address,
    chainId: number,
    wnative?: Address
): 'wrap' | 'unwrap' | null {
    if (isNativeToken(tokenIn) && isWrappedNative(tokenOut, chainId, wnative)) return 'wrap'
    if (isWrappedNative(tokenIn, chainId, wnative) && isNativeToken(tokenOut)) return 'unwrap'
    return null
}

const SKIP_UNWRAP_CHAINS: readonly number[] = [CHAIN_IDS.bitkub]

export function shouldSkipUnwrap(chainId: number): boolean {
    return SKIP_UNWRAP_CHAINS.includes(chainId)
}

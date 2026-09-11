export interface ParsedSwap {
    tokenAddr: string
    sender: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
    protocol: string
}

export interface BondingCurveSwapRow {
    tokenAddr: string
    sender: string
    isBuy: number
    amountIn: string
    amountOut: string
    timestamp: number
}

export interface V3SwapRow {
    tokenAddr: string
    txFrom: string
    amount0: string
    amount1: string
    token0Addr: string | null
    token1Addr: string | null
    timestamp: number
    protocol: string
}

export interface V2SwapRow {
    txFrom: string
    token0Addr: string
    token1Addr: string
    amount0In: string
    amount1In: string
    amount0Out: string
    amount1Out: string
    timestamp: number
    protocol: string
}

const abs = (x: bigint) => (x < 0n ? -x : x)

export function parseBondingCurveSwap(e: BondingCurveSwapRow): ParsedSwap {
    return {
        tokenAddr: e.tokenAddr.toLowerCase(),
        sender: e.sender,
        isBuy: e.isBuy === 1,
        amountIn: e.amountIn,
        amountOut: e.amountOut,
        timestamp: e.timestamp,
        protocol: 'junoswap',
    }
}

export function parseV3Swap(e: V3SwapRow, wrappedNative: string): ParsedSwap | null {
    const token0 = e.token0Addr?.toLowerCase()
    const token1 = e.token1Addr?.toLowerCase()
    let nativeIsToken0: boolean
    if (token1 === wrappedNative) nativeIsToken0 = false
    else if (token0 === wrappedNative) nativeIsToken0 = true
    else return null
    const nativeAmt = BigInt(nativeIsToken0 ? e.amount0 : e.amount1)
    const tokenAmt = BigInt(nativeIsToken0 ? e.amount1 : e.amount0)
    const isBuy = tokenAmt < 0n
    return {
        tokenAddr: e.tokenAddr.toLowerCase(),
        sender: e.txFrom,
        isBuy,
        amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
        amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'junoswap',
    }
}

export function parseV2Swap(e: V2SwapRow, wrappedNative: string): ParsedSwap | null {
    const token0 = e.token0Addr.toLowerCase()
    const token1 = e.token1Addr.toLowerCase()
    let nativeIn: bigint, nativeOut: bigint, tokenIn: bigint, tokenOut: bigint
    let tokenAddr: string
    if (token0 === wrappedNative) {
        nativeIn = BigInt(e.amount0In)
        nativeOut = BigInt(e.amount0Out)
        tokenIn = BigInt(e.amount1In)
        tokenOut = BigInt(e.amount1Out)
        tokenAddr = token1
    } else if (token1 === wrappedNative) {
        nativeIn = BigInt(e.amount1In)
        nativeOut = BigInt(e.amount1Out)
        tokenIn = BigInt(e.amount0In)
        tokenOut = BigInt(e.amount0Out)
        tokenAddr = token0
    } else {
        return null
    }
    const isBuy = nativeIn > 0n
    return {
        tokenAddr,
        sender: e.txFrom,
        isBuy,
        amountIn: (isBuy ? nativeIn : tokenIn).toString(),
        amountOut: (isBuy ? tokenOut : nativeOut).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'unknown',
    }
}

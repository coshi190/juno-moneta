export function isJunoswapProtocol(protocol: string): boolean {
    return protocol === 'junoswap' || protocol === 'junoswap-v1_1'
}

export interface ParsedSwap {
    tokenAddr: string
    sender: string
    isBuy: boolean
    amountIn: string
    grossAmountIn: string
    amountOut: string
    timestamp: number
    protocol: string
}

interface BondingCurveSwapRow {
    tokenAddr: string
    sender: string
    isBuy: number
    amountIn: string
    grossAmountIn?: string | null
    amountOut: string
    timestamp: number
    launchpadId: string
}

interface V3SwapRow {
    tokenAddr: string
    txFrom: string
    amount0: string
    amount1: string
    token0Addr: string | null
    token1Addr: string | null
    timestamp: number
    protocol: string
}

interface V2SwapRow {
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

export const abs = (x: bigint) => (x < 0n ? -x : x)

export function parseBondingCurveSwap(e: BondingCurveSwapRow): ParsedSwap {
    return {
        tokenAddr: e.tokenAddr,
        sender: e.sender,
        isBuy: e.isBuy === 1,
        amountIn: e.amountIn,
        grossAmountIn: e.grossAmountIn ?? e.amountIn,
        amountOut: e.amountOut,
        timestamp: e.timestamp,
        protocol: e.launchpadId,
    }
}

export function parseV3Swap(e: V3SwapRow, wrappedNative: string): ParsedSwap | null {
    const native0 = e.token1Addr !== wrappedNative
    if (native0 && e.token0Addr !== wrappedNative) return null
    const [native, token] = (native0 ? [e.amount0, e.amount1] : [e.amount1, e.amount0]).map(BigInt)
    const isBuy = token < 0n
    const amountIn = abs(isBuy ? native : token).toString()
    return {
        tokenAddr: e.tokenAddr,
        sender: e.txFrom,
        isBuy,
        amountIn,
        grossAmountIn: amountIn,
        amountOut: abs(isBuy ? token : native).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'junoswap',
    }
}

export function parseV2Swap(e: V2SwapRow, wrappedNative: string): ParsedSwap | null {
    const native0 = e.token0Addr === wrappedNative
    if (!native0 && e.token1Addr !== wrappedNative) return null
    const [in0, in1, out0, out1] = [e.amount0In, e.amount1In, e.amount0Out, e.amount1Out].map(
        BigInt
    )
    const [nativeIn, tokenIn, nativeOut, tokenOut] = native0
        ? [in0, in1, out0, out1]
        : [in1, in0, out1, out0]
    const isBuy = nativeIn > 0n
    const amountIn = (isBuy ? nativeIn : tokenIn).toString()
    return {
        tokenAddr: native0 ? e.token1Addr : e.token0Addr,
        sender: e.txFrom,
        isBuy,
        amountIn,
        grossAmountIn: amountIn,
        amountOut: (isBuy ? tokenOut : nativeOut).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'unknown',
    }
}

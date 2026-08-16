import type { Address } from 'viem'
import { ProtocolType, type DEXType } from '../configs/dex-config.js'
import { buildQuoteCall } from './quote.js'
import { batchRead, type ReadClient } from './multicall.js'

const REFERENCE_DIVISOR = 1000n

export function computePriceImpactPercent(
    fullAmountOut: bigint,
    amountIn: bigint,
    referenceAmountOut: bigint,
    referenceAmountIn: bigint
): number | undefined {
    if (referenceAmountOut <= 0n || referenceAmountIn <= 0n || amountIn <= 0n) return undefined
    const num = fullAmountOut * referenceAmountIn
    const den = amountIn * referenceAmountOut
    if (den === 0n) return undefined
    const ratioBps = Number((num * 10000n) / den)
    return Math.max(0, (10000 - ratioBps) / 100)
}

export interface RoutePriceImpactParams {
    chainId: number
    protocol: ProtocolType
    dexId?: DEXType
    path: Address[]
    fees?: number[]
    amountIn: bigint
    fullAmountOut: bigint
}

function extractAmountOut(protocol: ProtocolType, data: unknown): bigint | undefined {
    const arr = data as readonly bigint[] | undefined
    if (!arr || arr.length === 0) return undefined
    const out = protocol === ProtocolType.V3 ? arr[0] : arr.at(-1)
    return out && out > 0n ? out : undefined
}

export async function getRoutePriceImpact(
    client: ReadClient,
    { chainId, protocol, dexId, path, fees, amountIn, fullAmountOut }: RoutePriceImpactParams
): Promise<number | undefined> {
    const referenceAmountIn = amountIn / REFERENCE_DIVISOR
    if (referenceAmountIn <= 0n) return undefined

    const call = buildQuoteCall({
        protocol,
        chainId,
        dexId,
        tokenIn: path[0]!,
        tokenOut: path[path.length - 1]!,
        amountIn: referenceAmountIn,
        path,
        fees,
        fee: fees?.[0],
    })
    if (!call) return undefined

    const [result] = await batchRead(client, [call])
    if (result?.status !== 'success') return undefined

    const referenceAmountOut = extractAmountOut(protocol, result.result)
    if (referenceAmountOut === undefined) return undefined

    return computePriceImpactPercent(fullAmountOut, amountIn, referenceAmountOut, referenceAmountIn)
}

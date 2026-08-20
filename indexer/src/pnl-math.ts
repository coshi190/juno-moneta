import { formatEther, formatUnits } from 'viem'
import type { TokenPnl, PortfolioPnlTotals, PnlSwapEvent } from '@coshi190/junoswap-sdk'

export interface PnlFold {
    position: number
    costPoolUsd: number
    realizedUsd: number
    totalInvestedUsd: number
}

export const EMPTY_FOLD: PnlFold = {
    position: 0,
    costPoolUsd: 0,
    realizedUsd: 0,
    totalInvestedUsd: 0,
}

export interface FoldSwapInput {
    isBuy: boolean
    amountIn: string
    amountOut: string
    nativeUsd: number
}

export function applyFoldEvent(fold: PnlFold, e: FoldSwapInput, decimals: number): PnlFold {
    const next: PnlFold = { ...fold }
    if (e.isBuy) {
        const tokensIn = parseFloat(formatUnits(BigInt(e.amountOut), decimals))
        const nativePaid = parseFloat(formatEther(BigInt(e.amountIn)))
        const usdPaid = nativePaid * e.nativeUsd
        next.position += tokensIn
        next.costPoolUsd += usdPaid
        next.totalInvestedUsd += usdPaid
    } else {
        const tokensOut = parseFloat(formatUnits(BigInt(e.amountIn), decimals))
        const nativeRecv = parseFloat(formatEther(BigInt(e.amountOut)))
        const usdRecv = nativeRecv * e.nativeUsd
        const avgCost = next.position > 0 ? next.costPoolUsd / next.position : 0
        const soldFromPosition = Math.min(tokensOut, next.position)
        const costOfSold = avgCost * soldFromPosition
        next.realizedUsd += usdRecv - costOfSold
        next.costPoolUsd -= costOfSold
        next.position = Math.max(0, next.position - tokensOut)
    }
    return next
}

export function finalizeTokenPnl(
    fold: PnlFold,
    currentBalance: number,
    currentPrice: number | null
): TokenPnl {
    const avgCost = fold.position > 0 ? fold.costPoolUsd / fold.position : 0
    const costBasisUsd = avgCost * currentBalance
    const currentValueUsd = currentPrice !== null ? currentPrice * currentBalance : 0
    const unrealizedUsd = currentPrice !== null ? currentValueUsd - costBasisUsd : 0
    const totalPnlUsd = fold.realizedUsd + unrealizedUsd
    const pnlPercent = fold.totalInvestedUsd > 0 ? (totalPnlUsd / fold.totalInvestedUsd) * 100 : 0
    return {
        costBasisUsd,
        totalInvestedUsd: fold.totalInvestedUsd,
        realizedUsd: fold.realizedUsd,
        unrealizedUsd,
        totalPnlUsd,
        pnlPercent,
    }
}

export function finalizePortfolioPnl(
    foldsByToken: Map<string, PnlFold>,
    balanceByToken: Map<string, number>,
    priceUsdByToken: Map<string, number | null>
): { perToken: Map<string, TokenPnl>; totals: PortfolioPnlTotals } {
    const perToken = new Map<string, TokenPnl>()
    const totals: PortfolioPnlTotals = {
        totalInvestedUsd: 0,
        realizedUsd: 0,
        unrealizedUsd: 0,
        totalPnlUsd: 0,
        totalPnlPercent: 0,
    }

    for (const [tokenAddr, fold] of foldsByToken) {
        const currentBalance = balanceByToken.get(tokenAddr) ?? 0
        const currentPrice = priceUsdByToken.get(tokenAddr) ?? null
        const tp = finalizeTokenPnl(fold, currentBalance, currentPrice)
        perToken.set(tokenAddr, tp)
        totals.totalInvestedUsd += tp.totalInvestedUsd
        totals.realizedUsd += tp.realizedUsd
        totals.unrealizedUsd += tp.unrealizedUsd
        totals.totalPnlUsd += tp.totalPnlUsd
    }

    totals.totalPnlPercent =
        totals.totalInvestedUsd > 0 ? (totals.totalPnlUsd / totals.totalInvestedUsd) * 100 : 0

    return { perToken, totals }
}

export function foldEventsByToken(
    events: PnlSwapEvent[],
    priceAt: (timestamp: number) => number,
    decimalsByToken?: Map<string, number>
): Map<string, PnlFold> {
    const eventsByToken = new Map<string, PnlSwapEvent[]>()
    for (const event of events) {
        const key = event.tokenAddr.toLowerCase()
        const list = eventsByToken.get(key)
        if (list) list.push(event)
        else eventsByToken.set(key, [event])
    }

    const foldsByToken = new Map<string, PnlFold>()
    for (const [tokenAddr, tokenEvents] of eventsByToken) {
        const decimals = decimalsByToken?.get(tokenAddr) ?? 18
        let fold = EMPTY_FOLD
        for (const e of [...tokenEvents].sort((a, b) => a.timestamp - b.timestamp)) {
            fold = applyFoldEvent(
                fold,
                {
                    isBuy: e.isBuy,
                    amountIn: e.amountIn,
                    amountOut: e.amountOut,
                    nativeUsd: priceAt(e.timestamp),
                },
                decimals
            )
        }
        foldsByToken.set(tokenAddr, fold)
    }

    return foldsByToken
}

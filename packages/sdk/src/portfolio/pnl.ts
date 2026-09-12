import { formatEther, formatUnits } from 'viem'

export interface TokenPnl {
    costBasisUsd: number
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    pnlPercent: number
}

export interface PortfolioPnlTotals {
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    totalPnlPercent: number
}

export interface PnlSwapEvent {
    tokenAddr: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
}

export interface PnlFold {
    position: number
    costPoolUsd: number
    realizedUsd: number
    totalInvestedUsd: number
}

export interface ComputePnlInput {
    folds?: Map<string, PnlFold>
    events?: PnlSwapEvent[]
    nativeUsdAt?: (timestamp: number) => number
    decimalsByToken?: Map<string, number>
    balanceByToken?: Map<string, number>
    priceUsdByToken?: Map<string, number | null>
}

export interface ComputePnlResult {
    foldsByToken: Map<string, PnlFold>
    perToken: Map<string, TokenPnl>
    totals: PortfolioPnlTotals
}

const EMPTY_FOLD: PnlFold = {
    position: 0,
    costPoolUsd: 0,
    realizedUsd: 0,
    totalInvestedUsd: 0,
}

function applyFoldEvent(
    fold: PnlFold,
    e: PnlSwapEvent,
    nativeUsd: number,
    decimals: number
): PnlFold {
    const next: PnlFold = { ...fold }
    if (e.isBuy) {
        const tokensIn = parseFloat(formatUnits(BigInt(e.amountOut), decimals))
        const nativePaid = parseFloat(formatEther(BigInt(e.amountIn)))
        const usdPaid = nativePaid * nativeUsd
        next.position += tokensIn
        next.costPoolUsd += usdPaid
        next.totalInvestedUsd += usdPaid
    } else {
        const tokensOut = parseFloat(formatUnits(BigInt(e.amountIn), decimals))
        const nativeRecv = parseFloat(formatEther(BigInt(e.amountOut)))
        const usdRecv = nativeRecv * nativeUsd
        const avgCost = next.position > 0 ? next.costPoolUsd / next.position : 0
        const soldFromPosition = Math.min(tokensOut, next.position)
        const costOfSold = avgCost * soldFromPosition
        next.realizedUsd += usdRecv - costOfSold
        next.costPoolUsd -= costOfSold
        next.position = Math.max(0, next.position - tokensOut)
    }
    return next
}

function finalizeTokenPnl(
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

export function computePnl(input: ComputePnlInput): ComputePnlResult {
    const foldsByToken = new Map<string, PnlFold>()
    if (input.folds) {
        for (const [tokenAddr, fold] of input.folds) foldsByToken.set(tokenAddr.toLowerCase(), fold)
    }

    if (input.events?.length) {
        const eventsByToken = new Map<string, PnlSwapEvent[]>()
        for (const event of input.events) {
            const key = event.tokenAddr.toLowerCase()
            const list = eventsByToken.get(key)
            if (list) list.push(event)
            else eventsByToken.set(key, [event])
        }

        for (const [tokenAddr, tokenEvents] of eventsByToken) {
            const decimals = input.decimalsByToken?.get(tokenAddr) ?? 18
            let fold = foldsByToken.get(tokenAddr) ?? EMPTY_FOLD
            for (const e of [...tokenEvents].sort((a, b) => a.timestamp - b.timestamp)) {
                fold = applyFoldEvent(fold, e, input.nativeUsdAt?.(e.timestamp) ?? 0, decimals)
            }
            foldsByToken.set(tokenAddr, fold)
        }
    }

    const perToken = new Map<string, TokenPnl>()
    const totals: PortfolioPnlTotals = {
        totalInvestedUsd: 0,
        realizedUsd: 0,
        unrealizedUsd: 0,
        totalPnlUsd: 0,
        totalPnlPercent: 0,
    }

    for (const [tokenAddr, fold] of foldsByToken) {
        const currentBalance = input.balanceByToken?.get(tokenAddr) ?? fold.position
        const currentPrice = input.priceUsdByToken?.get(tokenAddr) ?? null
        const tp = finalizeTokenPnl(fold, currentBalance, currentPrice)
        perToken.set(tokenAddr, tp)
        totals.totalInvestedUsd += tp.totalInvestedUsd
        totals.realizedUsd += tp.realizedUsd
        totals.unrealizedUsd += tp.unrealizedUsd
        totals.totalPnlUsd += tp.totalPnlUsd
    }

    totals.totalPnlPercent =
        totals.totalInvestedUsd > 0 ? (totals.totalPnlUsd / totals.totalInvestedUsd) * 100 : 0

    return { foldsByToken, perToken, totals }
}

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

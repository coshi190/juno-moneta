import { formatEther, formatUnits } from 'viem'

export interface TokenPnl {
    costBasisUsd: number
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    pnlPercent: number
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
    priceUsdByToken?: Map<string, number | null>
}

const EMPTY_FOLD: PnlFold = { position: 0, costPoolUsd: 0, realizedUsd: 0, totalInvestedUsd: 0 }

const pct = (pnl: number, invested: number) => (invested > 0 ? (pnl / invested) * 100 : 0)

export function computePnl({
    folds,
    events = [],
    nativeUsdAt,
    decimalsByToken,
    priceUsdByToken,
}: ComputePnlInput) {
    const foldsByToken = new Map<string, PnlFold>()
    for (const [addr, fold] of folds ?? []) foldsByToken.set(addr.toLowerCase(), fold)

    for (const e of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
        const addr = e.tokenAddr.toLowerCase()
        const f = { ...(foldsByToken.get(addr) ?? EMPTY_FOLD) }
        const tokenWei = BigInt(e.isBuy ? e.amountOut : e.amountIn)
        const nativeWei = BigInt(e.isBuy ? e.amountIn : e.amountOut)
        const tokens = parseFloat(formatUnits(tokenWei, decimalsByToken?.get(addr) ?? 18))
        const usd = parseFloat(formatEther(nativeWei)) * (nativeUsdAt?.(e.timestamp) ?? 0)
        if (e.isBuy) {
            f.position += tokens
            f.costPoolUsd += usd
            f.totalInvestedUsd += usd
        } else {
            const costOfSold =
                f.position > 0 ? (f.costPoolUsd / f.position) * Math.min(tokens, f.position) : 0
            f.realizedUsd += usd - costOfSold
            f.costPoolUsd -= costOfSold
            f.position = Math.max(0, f.position - tokens)
        }
        foldsByToken.set(addr, f)
    }

    const perToken = new Map<string, TokenPnl>()
    const totals = { totalInvestedUsd: 0, realizedUsd: 0, unrealizedUsd: 0, totalPnlUsd: 0, totalPnlPercent: 0 }
    for (const [addr, f] of foldsByToken) {
        const price = priceUsdByToken?.get(addr) ?? null
        const costBasisUsd = f.position > 0 ? f.costPoolUsd : 0
        const unrealizedUsd = price === null ? 0 : price * f.position - costBasisUsd
        const totalPnlUsd = f.realizedUsd + unrealizedUsd
        perToken.set(addr, {
            costBasisUsd,
            totalInvestedUsd: f.totalInvestedUsd,
            realizedUsd: f.realizedUsd,
            unrealizedUsd,
            totalPnlUsd,
            pnlPercent: pct(totalPnlUsd, f.totalInvestedUsd),
        })
        totals.totalInvestedUsd += f.totalInvestedUsd
        totals.realizedUsd += f.realizedUsd
        totals.unrealizedUsd += unrealizedUsd
        totals.totalPnlUsd += totalPnlUsd
    }
    totals.totalPnlPercent = pct(totals.totalPnlUsd, totals.totalInvestedUsd)

    return { foldsByToken, perToken, totals }
}

import { formatEther } from 'viem'
import { computePoints, isJunoswapProtocol, type PnlSwapEvent } from '@coshi190/juno-moneta-sdk'
import { finalizePortfolioPnl, foldEventsByToken } from './pnl-math.js'

export interface LeaderboardSwapEvent extends PnlSwapEvent {
    sender: string
    protocol?: string
}

export interface AddressTraderStats {
    pnlUsd: number
    pnlPercent: number
    volumeNative: number
    junoVolumeNative: number
    externalVolumeNative: number
    points: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

export function computeWindowedTraderStats(
    events: LeaderboardSwapEvent[],
    priceAt: (timestamp: number) => number,
    currentPriceByToken: Map<string, number | null>,
    decimalsByToken?: Map<string, number>
): Map<string, AddressTraderStats> {
    const eventsByAddress = new Map<string, LeaderboardSwapEvent[]>()
    for (const event of events) {
        const key = event.sender.toLowerCase()
        const list = eventsByAddress.get(key)
        if (list) list.push(event)
        else eventsByAddress.set(key, [event])
    }

    const statsByAddress = new Map<string, AddressTraderStats>()
    for (const [address, addrEvents] of eventsByAddress) {
        let junoVolumeNative = 0
        let externalVolumeNative = 0
        let buyCount = 0
        let sellCount = 0
        for (const event of addrEvents) {
            const nativeAmount = parseFloat(
                formatEther(BigInt(event.isBuy ? event.amountIn : event.amountOut))
            )
            if (isJunoswapProtocol(event.protocol ?? 'junoswap')) junoVolumeNative += nativeAmount
            else externalVolumeNative += nativeAmount
            if (event.isBuy) buyCount++
            else sellCount++
        }

        const foldsByToken = foldEventsByToken(addrEvents, priceAt, decimalsByToken)
        const balanceByToken = new Map<string, number>()
        for (const [token, fold] of foldsByToken) balanceByToken.set(token, fold.position)

        const { totals } = finalizePortfolioPnl(foldsByToken, balanceByToken, currentPriceByToken)

        statsByAddress.set(address, {
            pnlUsd: totals.totalPnlUsd,
            pnlPercent: totals.totalPnlPercent,
            volumeNative: junoVolumeNative + externalVolumeNative,
            junoVolumeNative,
            externalVolumeNative,
            points: computePoints(junoVolumeNative, externalVolumeNative),
            tradeCount: addrEvents.length,
            buyCount,
            sellCount,
        })
    }

    return statsByAddress
}

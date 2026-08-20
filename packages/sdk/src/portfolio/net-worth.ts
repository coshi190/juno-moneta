import type { Address } from 'viem'
import { isNativeToken } from '../dex/native.js'
import {
    buildLedgerNetWorthSeries,
    classifyPriceKind,
    digestSwapEvents,
    DAY_SECONDS,
    type LedgerToken,
    type LedgerTokenMeta,
    type NetWorthPoint,
    type PnlSwapEvent,
    type PricePoint,
} from './ledger.js'

export interface NetWorthTokenInput {
    address: string
    decimals: number
    balance: number
    priceUsd: number
}

export interface NetWorthHistoryParams {
    chainId: number
    tokens: NetWorthTokenInput[]
    swapEvents: PnlSwapEvent[]
    nativeUsdPoints: PricePoint[]
    nativeUsdNow: number
    netWorthNow: number
    nowSec: number
    nativePricePointsByToken?: Map<string, PricePoint[]>
    windowStart?: number
}

export function needsPriceHistory(address: string, chainId: number): boolean {
    return classifyPriceKind(address, chainId) === 'reconstructed'
}

export function computeNetWorthHistory(params: NetWorthHistoryParams): NetWorthPoint[] {
    const windowStart = params.windowStart ?? params.nowSec - DAY_SECONDS

    const meta: LedgerTokenMeta[] = params.tokens.map((token) => ({
        address: token.address,
        decimals: token.decimals,
        priceKind: classifyPriceKind(token.address, params.chainId),
        isNativeCoin: isNativeToken(token.address as Address),
    }))

    const deltasByToken = digestSwapEvents(params.swapEvents, meta, windowStart, params.nowSec)

    const tokens: LedgerToken[] = params.tokens.map((token, i) => {
        const key = token.address.toLowerCase()
        return {
            currentBalance: token.balance,
            deltas: deltasByToken.get(key) ?? [],
            priceKind: meta[i]!.priceKind,
            nativePricePoints: params.nativePricePointsByToken?.get(key) ?? [],
            priceUsdNow: token.priceUsd,
        }
    })

    return buildLedgerNetWorthSeries({
        tokens,
        nativeUsdPoints: params.nativeUsdPoints,
        nativeUsdNow: params.nativeUsdNow,
        windowStart,
        nowSec: params.nowSec,
        netWorthNow: params.netWorthNow,
    })
}

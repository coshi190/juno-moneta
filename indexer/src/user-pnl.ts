import schema from 'ponder:schema'
import { formatEther } from 'viem'
import { isJunoswapProtocol } from '@coshi190/junoswap-sdk'
import { applyFoldEvent, EMPTY_FOLD, type PnlFold } from './pnl-math.js'
import { sanitizeUsdPrice, MAX_NATIVE_USD_PRICE } from './price-history.js'

export async function recordUserSwap(
    context: any,
    chainId: number,
    tokenAddr: string,
    user: string,
    isBuy: boolean,
    amountInWei: string,
    amountOutWei: string,
    decimals: number,
    nativeUsd: number,
    timestamp: number,
    protocol: string
): Promise<void> {
    const t = tokenAddr.toLowerCase()
    const u = user.toLowerCase()

    const safeNativeUsd = sanitizeUsdPrice(nativeUsd, MAX_NATIVE_USD_PRICE) ?? 0

    const pnlId = `${chainId}-${t}-${u}`
    const existing = await context.db.find(schema.userTokenPnl, { id: pnlId })
    const prev: PnlFold = existing
        ? {
              position: existing.position,
              costPoolUsd: existing.costPoolUsd,
              realizedUsd: existing.realizedUsd,
              totalInvestedUsd: existing.totalInvestedUsd,
          }
        : EMPTY_FOLD
    const next = applyFoldEvent(
        prev,
        { isBuy, amountIn: amountInWei, amountOut: amountOutWei, nativeUsd: safeNativeUsd },
        decimals
    )
    if (existing) {
        await context.db.update(schema.userTokenPnl, { id: pnlId }).set({
            position: next.position,
            costPoolUsd: next.costPoolUsd,
            realizedUsd: next.realizedUsd,
            totalInvestedUsd: next.totalInvestedUsd,
            updatedAt: timestamp,
        })
    } else {
        await context.db
            .insert(schema.userTokenPnl)
            .values({
                id: pnlId,
                chainId,
                tokenAddr: t,
                user: u,
                position: next.position,
                costPoolUsd: next.costPoolUsd,
                realizedUsd: next.realizedUsd,
                totalInvestedUsd: next.totalInvestedUsd,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    }

    const volumeNative = parseFloat(formatEther(BigInt(isBuy ? amountInWei : amountOutWei)))
    const isJuno = isJunoswapProtocol(protocol)
    const junoVolumeNative = isJuno ? volumeNative : 0
    const externalVolumeNative = isJuno ? 0 : volumeNative
    const statId = `${chainId}-${u}`
    const stat = await context.db.find(schema.userStat, { id: statId })
    if (stat) {
        await context.db.update(schema.userStat, { id: statId }).set({
            volumeNative: stat.volumeNative + volumeNative,
            junoVolumeNative: stat.junoVolumeNative + junoVolumeNative,
            externalVolumeNative: stat.externalVolumeNative + externalVolumeNative,
            tradeCount: stat.tradeCount + 1,
            buyCount: stat.buyCount + (isBuy ? 1 : 0),
            sellCount: stat.sellCount + (isBuy ? 0 : 1),
            updatedAt: timestamp,
        })
    } else {
        await context.db
            .insert(schema.userStat)
            .values({
                id: statId,
                chainId,
                user: u,
                volumeNative,
                junoVolumeNative,
                externalVolumeNative,
                tradeCount: 1,
                buyCount: isBuy ? 1 : 0,
                sellCount: isBuy ? 0 : 1,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    }
}

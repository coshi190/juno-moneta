import schema from 'ponder:schema'
import { formatEther, formatUnits } from 'viem'
import { getStablecoins } from './registry.js'
import { isJunoswapProtocol } from './parse-swaps.js'
import { sanitizeUsdPrice, parseTokenUsdPrice, MAX_NATIVE_USD_PRICE } from './price-history.js'

type PnlRow = {
    position: number
    costPoolUsd: number
    realizedUsd: number
    totalInvestedUsd: number
}

const rowOf = (existing: PnlRow | null | undefined): PnlRow => ({
    position: existing?.position ?? 0,
    costPoolUsd: existing?.costPoolUsd ?? 0,
    realizedUsd: existing?.realizedUsd ?? 0,
    totalInvestedUsd: existing?.totalInvestedUsd ?? 0,
})

async function upsertPnl(
    context: any,
    chainId: number,
    tokenAddr: string,
    user: string,
    next: PnlRow,
    timestamp: number
) {
    const id = `${chainId}-${tokenAddr}-${user}`
    await context.db
        .insert(schema.userTokenPnl)
        .values({ id, chainId, tokenAddr, user, ...next, updatedAt: timestamp })
        .onConflictDoUpdate({ ...next, updatedAt: timestamp })
}

async function priceUsdNow(context: any, chainId: number, tokenAddr: string): Promise<number> {
    const v3 = await context.db.find(schema.v3TokenSnapshot, { id: `${chainId}-${tokenAddr}` })
    return (
        parseTokenUsdPrice(v3?.lastPriceUsd) ??
        parseTokenUsdPrice(
            (await context.db.find(schema.tokenSnapshot, { tokenAddr }))?.lastPriceUsd
        ) ??
        0
    )
}

export async function applyPnlTransfer(
    context: any,
    chainId: number,
    tokenAddr: string,
    user: string,
    oldBalance: bigint,
    newBalance: bigint,
    txHash: string,
    timestamp: number
): Promise<void> {
    if (newBalance === oldBalance) return
    const existing = await context.db.find(schema.userTokenPnl, {
        id: `${chainId}-${tokenAddr}-${user}`,
    })
    const next = rowOf(existing)
    next.position = parseFloat(formatEther(newBalance))
    const legId = `${chainId}-${txHash}-${tokenAddr}-${user}`
    const leg = await context.db.find(schema.pnlTxLeg, { id: legId })

    if (newBalance > oldBalance) {
        if (!leg?.buySeen) {
            const tokens = parseFloat(formatEther(newBalance - oldBalance))
            const costUsd = tokens * (await priceUsdNow(context, chainId, tokenAddr))
            next.costPoolUsd += costUsd
            await context.db
                .insert(schema.pnlTxLeg)
                .values({ id: legId, inCostUsd: costUsd })
                .onConflictDoUpdate((row: any) => ({
                    inCostUsd: row.inCostUsd + costUsd,
                }))
        }
    } else if (oldBalance > 0n) {
        const oldPosition = parseFloat(formatEther(oldBalance))
        const outCostUsd = next.costPoolUsd * (1 - next.position / oldPosition)
        next.costPoolUsd -= outCostUsd
        if (leg?.sellSeen) {
            next.realizedUsd -= outCostUsd
        } else {
            await context.db
                .insert(schema.pnlTxLeg)
                .values({ id: legId, outCostUsd })
                .onConflictDoUpdate((row: any) => ({
                    outCostUsd: row.outCostUsd + outCostUsd,
                }))
        }
    }

    await upsertPnl(context, chainId, tokenAddr, user, next, timestamp)
}

export async function recordUserSwap(
    context: any,
    chainId: number,
    tokenAddr: string,
    user: string,
    isBuy: boolean,
    amountInWei: string,
    grossAmountInWei: string,
    amountOutWei: string,
    decimals: number,
    nativeUsd: number,
    timestamp: number,
    protocol: string,
    txHash: string
): Promise<void> {
    const t = tokenAddr.toLowerCase()
    const u = user.toLowerCase()

    const safeNativeUsd = sanitizeUsdPrice(nativeUsd, MAX_NATIVE_USD_PRICE) ?? 0

    const volumeNative = parseFloat(formatEther(BigInt(isBuy ? amountInWei : amountOutWei)))
    const isJuno = isJunoswapProtocol(protocol)
    const junoVolumeNative = isJuno ? volumeNative : 0
    const externalVolumeNative = isJuno ? 0 : volumeNative
    const volumeUsd = volumeNative * safeNativeUsd
    const buyCount = isBuy ? 1 : 0
    const sellCount = isBuy ? 0 : 1
    await context.db
        .insert(schema.userStat)
        .values({
            id: `${chainId}-${u}`,
            chainId,
            user: u,
            volumeNative,
            junoVolumeNative,
            externalVolumeNative,
            volumeUsd,
            tradeCount: 1,
            buyCount,
            sellCount,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate((s: any) => ({
            volumeNative: s.volumeNative + volumeNative,
            junoVolumeNative: s.junoVolumeNative + junoVolumeNative,
            externalVolumeNative: s.externalVolumeNative + externalVolumeNative,
            volumeUsd: s.volumeUsd + volumeUsd,
            tradeCount: s.tradeCount + 1,
            buyCount: s.buyCount + buyCount,
            sellCount: s.sellCount + sellCount,
            updatedAt: timestamp,
        }))

    if (getStablecoins(chainId)?.has(t)) return

    const [existing, tracked] = await Promise.all([
        context.db.find(schema.userTokenPnl, { id: `${chainId}-${t}-${u}` }),
        context.db.find(schema.launchToken, { tokenAddr: t }),
    ])
    const next = rowOf(existing)
    const tokens = parseFloat(
        formatUnits(BigInt(isBuy ? amountOutWei : grossAmountInWei), decimals)
    )
    const usd =
        parseFloat(formatEther(BigInt(isBuy ? grossAmountInWei : amountOutWei))) * safeNativeUsd

    if (isBuy) {
        next.costPoolUsd += usd
        next.totalInvestedUsd += usd
        if (!tracked) {
            next.position += tokens
        } else {
            const legId = `${chainId}-${txHash}-${t}-${u}`
            const leg = await context.db.find(schema.pnlTxLeg, { id: legId })
            if (leg) next.costPoolUsd = Math.max(0, next.costPoolUsd - leg.inCostUsd)
            await context.db
                .insert(schema.pnlTxLeg)
                .values({ id: legId, buySeen: 1 })
                .onConflictDoUpdate({ inCostUsd: 0, buySeen: 1 })
        }
    } else if (tracked) {
        const legId = `${chainId}-${txHash}-${t}-${u}`
        const leg = await context.db.find(schema.pnlTxLeg, { id: legId })
        next.realizedUsd += usd - (leg?.outCostUsd ?? 0)
        await context.db
            .insert(schema.pnlTxLeg)
            .values({ id: legId, sellSeen: 1 })
            .onConflictDoUpdate({ outCostUsd: 0, sellSeen: 1 })
    } else {
        const avg = next.position > 0 ? next.costPoolUsd / next.position : 0
        const sold = Math.min(tokens, next.position)
        next.realizedUsd += usd - avg * sold
        next.costPoolUsd -= avg * sold
        next.position = Math.max(0, next.position - tokens)
    }
    await upsertPnl(context, chainId, t, u, next, timestamp)
}

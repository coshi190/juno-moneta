import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther, zeroAddress } from 'viem'
import { readERC20Metadata } from './erc20-read.js'
import { creatorFeeShareForSwap } from './creator-fee.js'
import { sanitizeUsdPrice, MAX_TOKEN_USD_PRICE } from './price-history.js'
import { recordUserSwap } from './user-pnl.js'
import { foldTokenCandle } from './candles.js'
import {
    contractNameFor,
    contractNames,
    enabledLaunchpads,
    getAdapter,
} from './launchpads/index.js'
import type { HandlerArgs, LaunchpadAdapter } from './launchpads/types.js'
import type { CurveParams, Launchpad } from './launchpads/registry.js'

const CURVE_ADDRESSES: Record<number, ReadonlySet<string>> = (() => {
    const byChain: Record<number, Set<string>> = {}
    for (const { launchpad } of enabledLaunchpads()) {
        const addresses = Array.isArray(launchpad.address) ? launchpad.address : [launchpad.address]
        for (const address of addresses) {
            ;(byChain[launchpad.chainId] ??= new Set()).add(address.toLowerCase())
        }
    }
    return byChain
})()

function calculatePriceFromReserves(
    isBuy: boolean,
    reserveIn: bigint,
    reserveOut: bigint,
    curve: CurveParams
): number {
    const nativeReserve = isBuy ? reserveIn : reserveOut
    const tokenReserve = isBuy ? reserveOut : reserveIn
    if (nativeReserve === 0n || tokenReserve === 0n) return 0
    const effectiveReserve = parseFloat(formatEther(nativeReserve + curve.virtualReserve))
    const tokenRes = parseFloat(formatEther(tokenReserve))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

function calculateMarketCapFromReserves(
    isBuy: boolean,
    reserveIn: bigint,
    reserveOut: bigint,
    curve: CurveParams
): string {
    if (reserveIn === 0n || reserveOut === 0n) return '0'
    const nativeReserve = isBuy ? reserveIn : reserveOut
    const tokenReserve = isBuy ? reserveOut : reserveIn
    const effectiveReserve = nativeReserve + curve.virtualReserve
    const marketCap = (effectiveReserve * curve.totalSupply) / tokenReserve
    return formatEther(marketCap)
}

function calculateVolume(isBuy: boolean, amountIn: bigint, amountOut: bigint): bigint {
    return isBuy ? amountIn : amountOut
}

function calculatePreSwapPrice(
    isBuy: boolean,
    reserveIn: bigint,
    reserveOut: bigint,
    amountIn: bigint,
    amountOut: bigint,
    curve: CurveParams
): number {
    let preNative: bigint
    let preToken: bigint
    if (isBuy) {
        preNative = reserveIn - amountIn
        preToken = reserveOut + amountOut
    } else {
        preNative = reserveOut + amountOut
        preToken = reserveIn - amountIn
    }
    if (preNative < 0n || preToken <= 0n) return 0
    const effectiveReserve = parseFloat(formatEther(preNative + curve.virtualReserve))
    const tokenRes = parseFloat(formatEther(preToken))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

function defaultSnapshot(tokenAddr: string, chainId: number, launchpadId: string) {
    return {
        tokenAddr,
        chainId,
        launchpadId,
        lastPrice: '0',
        lastPriceUsd: '0',
        marketCapNative: '0',
        athMarketCapNative: '0',
        totalBuys: 0,
        totalSells: 0,
        totalVolumeNative: '0',
        holderCount: 0,
        creatorFeeNative: '0',
        creatorFeeClaimedNative: '0',
        creatorFeeToken: '0',
        creatorFeeClaimedToken: '0',
        lastSwapAt: 0,
        price1dAgo: null as string | null,
        price1dAgoTimestamp: null as number | null,
        priceChange1dPct: null as string | null,
        updatedAt: 0,
    }
}

async function handleCreation(args: HandlerArgs, launchpad: Launchpad, adapter: LaunchpadAdapter) {
    const { event, context } = args
    const { chainId, launchpadId } = launchpad
    const creation = await adapter.creation(args)
    const tokenAddrLower = creation.tokenAddr.toLowerCase()

    const meta =
        creation.name === undefined || creation.symbol === undefined
            ? await readERC20Metadata(context.client, tokenAddrLower)
            : { name: creation.name, symbol: creation.symbol }

    const market = creation.market?.toLowerCase() ?? null

    await context.db
        .insert(schema.launchToken)
        .values({
            tokenAddr: tokenAddrLower,
            chainId,
            launchpadId,
            creator: creation.creator.toLowerCase(),
            name: meta.name,
            symbol: meta.symbol,
            logo: creation.logo,
            market,
            description: creation.description,
            link1: creation.link1,
            link2: creation.link2,
            link3: creation.link3,
            createdTime: creation.createdTime,
            isGraduated: 0,
            graduatedAt: null,
            createdAtBlock: Number(event.block.number),
        })
        .onConflictDoNothing()

    if (market) {
        await context.db
            .insert(schema.launchMarket)
            .values({ market, chainId, tokenAddr: tokenAddrLower })
            .onConflictDoNothing()
    }
}

async function handleSwap(
    args: HandlerArgs,
    launchpad: Launchpad,
    adapter: LaunchpadAdapter,
    bindingIsBuy?: boolean
) {
    const { event, context } = args
    const { chainId, launchpadId, curve } = launchpad
    const {
        tokenAddr,
        sender,
        isBuy,
        amountIn,
        amountOut,
        reserveIn,
        reserveOut,
        creatorFeeNative,
    } = await adapter.swap(args, bindingIsBuy)
    const tokenAddrLower = tokenAddr.toLowerCase()
    const senderLower = sender.toLowerCase()
    const id = `${chainId}-${event.block.number}-${event.log.logIndex}`
    const timestamp = Number(event.block.timestamp)

    await context.db.insert(schema.swapEvent).values({
        id,
        chainId,
        launchpadId,
        tokenAddr: tokenAddrLower,
        sender: senderLower,
        isBuy: isBuy ? 1 : 0,
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
        reserveIn: reserveIn.toString(),
        reserveOut: reserveOut.toString(),
        blockNumber: Number(event.block.number),
        timestamp,
        transactionHash: event.transaction.hash,
    })

    const price = calculatePriceFromReserves(isBuy, reserveIn, reserveOut, curve)
    const marketCap = calculateMarketCapFromReserves(isBuy, reserveIn, reserveOut, curve)
    const volume = calculateVolume(isBuy, amountIn, amountOut)

    const preSwapPrice = calculatePreSwapPrice(
        isBuy,
        reserveIn,
        reserveOut,
        amountIn,
        amountOut,
        curve
    )
    await foldTokenCandle(
        context,
        chainId,
        tokenAddrLower,
        'bc',
        timestamp,
        price,
        Number(formatEther(volume)),
        preSwapPrice
    )
    const creatorFeeShare = creatorFeeShareForSwap(amountIn, curve)
    const creatorFeeNativeDelta = creatorFeeNative ?? (isBuy ? creatorFeeShare : 0n)
    const creatorFeeTokenDelta = creatorFeeNative !== undefined ? 0n : isBuy ? 0n : creatorFeeShare

    const nativePriceRecord = await context.db.find(schema.nativeUsdPrice, { chainId })
    const nativeUsd = nativePriceRecord ? parseFloat(nativePriceRecord.price) : 0
    const rawPriceUsd = nativeUsd > 0 && price > 0 ? price * nativeUsd : 0
    const priceUsd = sanitizeUsdPrice(rawPriceUsd, MAX_TOKEN_USD_PRICE) ?? 0

    await recordUserSwap(
        context,
        chainId,
        tokenAddrLower,
        senderLower,
        isBuy,
        amountIn.toString(),
        amountOut.toString(),
        18,
        nativeUsd,
        timestamp,
        launchpadId
    )

    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: tokenAddrLower,
    })
    const snap = existingSnapshot ?? defaultSnapshot(tokenAddrLower, chainId, launchpadId)
    const isNewSnapshot = !existingSnapshot

    const athMarketCap = Math.max(
        parseFloat(marketCap),
        parseFloat(snap.athMarketCapNative ?? '0')
    ).toString()

    const holderId = `${chainId}-${tokenAddrLower}-${senderLower}`
    const existingHolder = await context.db.find(schema.tokenHolder, { id: holderId })
    const oldBalance = existingHolder ? BigInt(existingHolder.balance) : 0n
    const isNewHolder = !existingHolder

    const balanceChange = isBuy ? amountOut : -amountIn
    const newBalance = oldBalance + balanceChange

    let price1dAgo: string | null = snap.price1dAgo ?? null
    let price1dAgoTimestamp: number | null = snap.price1dAgoTimestamp ?? null
    let priceChange1dPct: string | null = snap.priceChange1dPct ?? null

    const currentDayStart = Math.floor(timestamp / 86400) * 86400
    const refDayStart = snap.price1dAgoTimestamp
        ? Math.floor(snap.price1dAgoTimestamp / 86400) * 86400
        : null

    if (refDayStart === null || currentDayStart > refDayStart) {
        if ((snap.lastSwapAt ?? 0) > 0) {
            price1dAgo = snap.lastPrice ?? '0'
            price1dAgoTimestamp = snap.lastSwapAt ?? null
        }
    }

    if (price1dAgo !== null && price1dAgo !== '0') {
        const pastPrice = parseFloat(price1dAgo)
        if (pastPrice > 0 && price > 0) {
            priceChange1dPct = (((price - pastPrice) / pastPrice) * 100).toString()
        }
    }

    let holderCount = snap.holderCount ?? 0
    const oldPositive = oldBalance > 0n
    const newPositive = newBalance > 0n
    if (!oldPositive && newPositive) holderCount += 1
    if (oldPositive && !newPositive) holderCount = Math.max(0, holderCount - 1)

    if (isNewSnapshot) {
        await context.db
            .insert(schema.tokenSnapshot)
            .values({
                tokenAddr: tokenAddrLower,
                chainId,
                launchpadId,
                lastPrice: price > 0 ? price.toString() : '0',
                lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : '0',
                marketCapNative: marketCap,
                athMarketCapNative: athMarketCap,
                totalBuys: isBuy ? 1 : 0,
                totalSells: isBuy ? 0 : 1,
                totalVolumeNative: volume.toString(),
                holderCount,
                creatorFeeNative: creatorFeeNativeDelta.toString(),
                creatorFeeClaimedNative: '0',
                creatorFeeToken: creatorFeeTokenDelta.toString(),
                creatorFeeClaimedToken: '0',
                lastSwapAt: timestamp,
                price1dAgo,
                price1dAgoTimestamp,
                priceChange1dPct,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    } else {
        await context.db.update(schema.tokenSnapshot, { tokenAddr: tokenAddrLower }).set({
            lastPrice: price > 0 ? price.toString() : (snap.lastPrice ?? '0'),
            lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : (snap.lastPriceUsd ?? '0'),
            marketCapNative: marketCap,
            athMarketCapNative: athMarketCap,
            totalBuys: (snap.totalBuys ?? 0) + (isBuy ? 1 : 0),
            totalSells: (snap.totalSells ?? 0) + (isBuy ? 0 : 1),
            totalVolumeNative: (BigInt(snap.totalVolumeNative ?? '0') + volume).toString(),
            holderCount,
            creatorFeeNative: (
                BigInt(snap.creatorFeeNative ?? '0') + creatorFeeNativeDelta
            ).toString(),
            creatorFeeToken: (
                BigInt(snap.creatorFeeToken ?? '0') + creatorFeeTokenDelta
            ).toString(),
            lastSwapAt: timestamp,
            price1dAgo,
            price1dAgoTimestamp,
            priceChange1dPct,
            updatedAt: timestamp,
        })
    }

    if (isNewHolder) {
        await context.db
            .insert(schema.tokenHolder)
            .values({
                id: holderId,
                chainId,
                tokenAddr: tokenAddrLower,
                address: senderLower,
                balance: newBalance.toString(),
            })
            .onConflictDoNothing()
    } else {
        await context.db.update(schema.tokenHolder, { id: holderId }).set({
            balance: newBalance.toString(),
        })
    }
}

async function handleGraduation(args: HandlerArgs, adapter: LaunchpadAdapter) {
    const { context } = args
    const { tokenAddr: raw, ammPool: rawPool, graduationTarget } = await adapter.graduation(args)
    const tokenAddr = raw.toLowerCase()

    const existing = await context.db.find(schema.launchToken, { tokenAddr })
    if (!existing) return

    const ammPool = rawPool?.toLowerCase()

    await context.db.update(schema.launchToken, { tokenAddr }).set({
        isGraduated: 1,
        graduatedAt: Number(args.event.block.timestamp),
        ammPool: ammPool ?? null,
        graduationTarget: graduationTarget ?? null,
    })

    // Lets the external-DEX swap handlers recognise a launch token's pool by address.
    if (ammPool) {
        await context.db
            .insert(schema.graduatedPool)
            .values({ pool: ammPool, chainId: existing.chainId, tokenAddr })
            .onConflictDoNothing()
    }
}

async function handleTransfer({ event, context }: HandlerArgs, chainId: number) {
    const { from, to, value: amount } = event.args
    const fromLower = from.toLowerCase()
    const toLower = to.toLowerCase()
    const tokenAddrLower = event.log.address.toLowerCase()
    const curveAddresses = CURVE_ADDRESSES[chainId]

    if (fromLower === zeroAddress || toLower === zeroAddress) return
    if (curveAddresses?.has(fromLower) || curveAddresses?.has(toLower)) return

    const launchToken = await context.db.find(schema.launchToken, { tokenAddr: tokenAddrLower })
    if (launchToken?.market && (fromLower === launchToken.market || toLower === launchToken.market))
        return

    await context.db
        .insert(schema.transferEvent)
        .values({
            id: `${chainId}-${event.block.number}-${event.log.logIndex}`,
            chainId,
            tokenAddr: tokenAddrLower,
            from: fromLower,
            to: toLower,
            amount: amount.toString(),
            blockNumber: Number(event.block.number),
            timestamp: Number(event.block.timestamp),
            transactionHash: event.transaction.hash,
        })
        .onConflictDoNothing()

    const amt = BigInt(amount)
    const fromNew = await applyHolderDelta(context, chainId, tokenAddrLower, fromLower, -amt)
    const toNew = await applyHolderDelta(context, chainId, tokenAddrLower, toLower, amt)

    const snap = await context.db.find(schema.tokenSnapshot, { tokenAddr: tokenAddrLower })
    if (snap) {
        let holderCount = snap.holderCount ?? 0
        if (fromNew.crossedToZero) holderCount = Math.max(0, holderCount - 1)
        if (toNew.crossedToPositive) holderCount += 1
        if (holderCount !== (snap.holderCount ?? 0)) {
            await context.db
                .update(schema.tokenSnapshot, { tokenAddr: tokenAddrLower })
                .set({ holderCount })
        }
    }
}

async function applyHolderDelta(
    context: any,
    chainId: number,
    tokenAddr: string,
    address: string,
    delta: bigint
): Promise<{ crossedToPositive: boolean; crossedToZero: boolean }> {
    const id = `${chainId}-${tokenAddr}-${address}`
    const existing = await context.db.find(schema.tokenHolder, { id })
    const oldBalance = existing ? BigInt(existing.balance) : 0n
    const newBalance = oldBalance + delta

    if (existing) {
        await context.db.update(schema.tokenHolder, { id }).set({ balance: newBalance.toString() })
    } else {
        await context.db
            .insert(schema.tokenHolder)
            .values({ id, chainId, tokenAddr, address, balance: newBalance.toString() })
            .onConflictDoNothing()
    }

    return {
        crossedToPositive: oldBalance <= 0n && newBalance > 0n,
        crossedToZero: oldBalance > 0n && newBalance <= 0n,
    }
}

type CurveEvent = 'CurveJunoswapKubTestnet:Creation'

for (const { chainSlug, launchpad } of enabledLaunchpads()) {
    const adapter = getAdapter(launchpad.launchpadId)
    const names = contractNames(launchpad.launchpadId, chainSlug)
    const { creation, swaps, graduation } = adapter.bindings
    const bind = (contract: string, event: string) => `${contract}:${event}` as CurveEvent

    ponder.on(bind(contractNameFor(names, creation.contract), creation.event), (args) =>
        handleCreation(args as HandlerArgs, launchpad, adapter)
    )
    for (const swap of swaps) {
        ponder.on(bind(contractNameFor(names, swap.contract), swap.event), (args) =>
            handleSwap(args as HandlerArgs, launchpad, adapter, swap.isBuy)
        )
    }
    ponder.on(bind(contractNameFor(names, graduation.contract), graduation.event), (args) =>
        handleGraduation(args as HandlerArgs, adapter)
    )
    ponder.on(bind(names.token, 'Transfer'), (args) =>
        handleTransfer(args as HandlerArgs, launchpad.chainId)
    )
}

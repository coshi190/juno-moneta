import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther, zeroAddress } from 'viem'
import { readERC20Metadata } from './erc20-read.js'
import { creatorFeeShareForSwap, VIRTUAL_AMOUNT } from './creator-fee.js'
import { BONDING_CURVE_ADDRESS_BY_CHAIN, isLaunchpadChain } from '@coshi190/junoswap-sdk'
import { sanitizeUsdPrice, MAX_TOKEN_USD_PRICE } from './price-history.js'
import { CHAIN_IDS } from './chains.js'
import { recordUserSwap } from './user-pnl.js'
import { foldTokenCandle } from './candles.js'

const MAINNET_ENABLED = isLaunchpadChain(CHAIN_IDS.bitkub)

type HandlerArgs = { event: any; context: any }

const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n

function calculatePriceFromReserves(isBuy: boolean, reserveIn: bigint, reserveOut: bigint): number {
    const nativeReserve = isBuy ? reserveIn : reserveOut
    const tokenReserve = isBuy ? reserveOut : reserveIn
    if (nativeReserve === 0n || tokenReserve === 0n) return 0
    const effectiveReserve = parseFloat(formatEther(nativeReserve + VIRTUAL_AMOUNT))
    const tokenRes = parseFloat(formatEther(tokenReserve))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

function calculateMarketCapFromReserves(
    isBuy: boolean,
    reserveIn: bigint,
    reserveOut: bigint
): string {
    if (reserveIn === 0n || reserveOut === 0n) return '0'
    const nativeReserve = isBuy ? reserveIn : reserveOut
    const tokenReserve = isBuy ? reserveOut : reserveIn
    const effectiveReserve = nativeReserve + VIRTUAL_AMOUNT
    const marketCap = (effectiveReserve * TOTAL_SUPPLY) / tokenReserve
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
    amountOut: bigint
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
    const effectiveReserve = parseFloat(formatEther(preNative + VIRTUAL_AMOUNT))
    const tokenRes = parseFloat(formatEther(preToken))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

function defaultSnapshot(tokenAddr: string, chainId: number) {
    return {
        tokenAddr,
        chainId,
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

async function handleCreation({ event, context }: HandlerArgs, chainId: number) {
    const { creator, tokenAddr, logo, description, link1, link2, link3, createdTime } = event.args
    const tokenAddrLower = tokenAddr.toLowerCase()

    const meta = await readERC20Metadata(chainId, tokenAddrLower)

    await context.db
        .insert(schema.launchToken)
        .values({
            tokenAddr: tokenAddrLower,
            chainId,
            creator: creator.toLowerCase(),
            name: meta.name,
            symbol: meta.symbol,
            logo: logo ?? '',
            description: description ?? '',
            link1: link1 ?? '',
            link2: link2 ?? '',
            link3: link3 ?? '',
            createdTime: Number(createdTime ?? 0),
            isGraduated: 0,
            graduatedAt: null,
            createdAtBlock: Number(event.block.number),
        })
        .onConflictDoNothing()
}

async function handleSwap({ event, context }: HandlerArgs, chainId: number) {
    const { sender, isBuy, tokenAddr, amountIn, amountOut, reserveIn, reserveOut } = event.args
    const tokenAddrLower = tokenAddr.toLowerCase()
    const senderLower = sender.toLowerCase()
    const id = `${chainId}-${event.block.number}-${event.log.logIndex}`
    const timestamp = Number(event.block.timestamp)

    await context.db.insert(schema.swapEvent).values({
        id,
        chainId,
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

    const price = calculatePriceFromReserves(isBuy, BigInt(reserveIn), BigInt(reserveOut))
    const marketCap = calculateMarketCapFromReserves(isBuy, BigInt(reserveIn), BigInt(reserveOut))
    const volume = calculateVolume(isBuy, amountIn, amountOut)

    const preSwapPrice = calculatePreSwapPrice(
        isBuy,
        BigInt(reserveIn),
        BigInt(reserveOut),
        BigInt(amountIn),
        BigInt(amountOut)
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
    const creatorFeeShare = creatorFeeShareForSwap(amountIn)
    const creatorFeeNativeDelta = isBuy ? creatorFeeShare : 0n
    const creatorFeeTokenDelta = isBuy ? 0n : creatorFeeShare

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
        'junoswap'
    )

    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: tokenAddrLower,
    })
    const snap = existingSnapshot ?? defaultSnapshot(tokenAddrLower, chainId)
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

async function handleGraduation({ event, context }: HandlerArgs) {
    const { tokenAddr } = event.args

    await context.db.update(schema.launchToken, { tokenAddr: tokenAddr.toLowerCase() }).set({
        isGraduated: 1,
        graduatedAt: Number(event.block.timestamp),
    })
}

async function handleTransfer({ event, context }: HandlerArgs, chainId: number) {
    const { from, to, value: amount } = event.args
    const fromLower = from.toLowerCase()
    const toLower = to.toLowerCase()
    const tokenAddrLower = event.log.address.toLowerCase()
    const bondingCurveLower = BONDING_CURVE_ADDRESS_BY_CHAIN[chainId]

    if (fromLower === zeroAddress || toLower === zeroAddress) return
    if (fromLower === bondingCurveLower || toLower === bondingCurveLower) return

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

ponder.on('BondingCurveJunoswap:Creation', (args) => handleCreation(args, 25925))
ponder.on('BondingCurveJunoswap:Swap', (args) => handleSwap(args, 25925))
ponder.on('BondingCurveJunoswap:Graduation', (args) => handleGraduation(args))
ponder.on('LaunchToken:Transfer', (args) => handleTransfer(args, 25925))

if (MAINNET_ENABLED) {
    ponder.on('BondingCurveJunoswapBitkub:Creation' as 'BondingCurveJunoswap:Creation', (args) =>
        handleCreation(args, 96)
    )
    ponder.on('BondingCurveJunoswapBitkub:Swap' as 'BondingCurveJunoswap:Swap', (args) =>
        handleSwap(args, 96)
    )
    ponder.on(
        'BondingCurveJunoswapBitkub:Graduation' as 'BondingCurveJunoswap:Graduation',
        (args) => handleGraduation(args)
    )
    ponder.on('LaunchTokenBitkub:Transfer' as 'LaunchToken:Transfer', (args) =>
        handleTransfer(args, 96)
    )
}

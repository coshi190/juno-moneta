import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther, parseEther, zeroAddress } from 'viem'
import { readTrackingTag } from '@coshi190/juno-moneta-sdk'
import { readERC20Metadata } from './erc20-read.js'
import { sanitizeUsdPrice, MAX_TOKEN_USD_PRICE } from './price-history.js'
import { computePriceFromReserves, computeMarketCapFromReserves } from './curve-math.js'
import { applyPnlTransfer, recordUserSwap } from './user-pnl.js'
import { foldTokenCandle } from './candles.js'
import { countsTowardStats } from './parse-swaps.js'
import {
    contractNameFor,
    contractNames,
    enabledLaunchpads,
    getAdapter,
} from './launchpads/index.js'
import type { HandlerArgs, LaunchpadAdapter } from './launchpads/types.js'
import type { Launchpad } from './launchpads/registry.js'

const INFRA_ADDRESSES: Record<number, ReadonlySet<string>> = (() => {
    const byChain: Record<number, Set<string>> = {}
    for (const { launchpad } of enabledLaunchpads()) {
        const addresses = Array.isArray(launchpad.address) ? launchpad.address : [launchpad.address]
        const set = (byChain[launchpad.chainId] ??= new Set())
        for (const address of [...addresses, launchpad.feeCollector, launchpad.lpLocker]) {
            if (address) set.add(address.toLowerCase())
        }
    }
    return byChain
})()

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
            graduationTarget: creation.graduationTarget ?? null,
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
    const { chainId, launchpadId } = launchpad
    const {
        tokenAddr,
        sender,
        isBuy,
        amountIn,
        amountOut,
        reserveIn,
        reserveOut,
        creatorFeeNative,
        virtualReserve,
    } = await adapter.swap(args, bindingIsBuy)
    const curve =
        virtualReserve === undefined ? launchpad.curve : { ...launchpad.curve, virtualReserve }

    const grossAmountIn =
        curve.pumpFeeBps > 0n ? (amountIn * 10000n) / (10000n - curve.pumpFeeBps) : amountIn
    const tokenAddrLower = tokenAddr.toLowerCase()
    const senderLower = sender.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const viaFrontend = !!readTrackingTag(event.transaction.input, event.transaction.from)

    const orient = (inV: bigint, outV: bigint) =>
        isBuy ? ([inV, outV] as const) : ([outV, inV] as const)
    const [nativeReserve, tokenReserve] = orient(reserveIn, reserveOut)
    const [preNative, preToken] = orient(reserveIn - amountIn, reserveOut + amountOut)

    const price = computePriceFromReserves(nativeReserve, tokenReserve, curve)
    const preSwapPrice = computePriceFromReserves(preNative, preToken, curve)

    await context.db.insert(schema.swapEvent).values({
        id: `${chainId}-${event.block.number}-${event.log.logIndex}`,
        chainId,
        launchpadId,
        tokenAddr: tokenAddrLower,
        sender: senderLower,
        isBuy: isBuy ? 1 : 0,
        amountIn: amountIn.toString(),
        grossAmountIn: grossAmountIn.toString(),
        amountOut: amountOut.toString(),
        reserveIn: reserveIn.toString(),
        reserveOut: reserveOut.toString(),
        priceNative: price.toString(),
        preSwapPriceNative: preSwapPrice.toString(),
        blockNumber: Number(event.block.number),
        timestamp,
        transactionHash: event.transaction.hash,
        viaFrontend: viaFrontend ? 1 : 0,
    })

    const marketCap = computeMarketCapFromReserves(nativeReserve, tokenReserve, curve)
    const [volume] = orient(amountIn, amountOut)

    await foldTokenCandle(context, chainId, tokenAddrLower, 'bc', timestamp, price, preSwapPrice)

    const nativePriceRecord = await context.db.find(schema.nativeUsdPrice, { chainId })
    const nativeUsd = nativePriceRecord ? parseFloat(nativePriceRecord.price) : 0
    const priceUsd = sanitizeUsdPrice(price * nativeUsd, MAX_TOKEN_USD_PRICE) ?? 0

    if (countsTowardStats(launchpadId, viaFrontend)) {
        await recordUserSwap(
            context,
            chainId,
            tokenAddrLower,
            senderLower,
            isBuy,
            amountIn.toString(),
            grossAmountIn.toString(),
            amountOut.toString(),
            18,
            nativeUsd,
            timestamp,
            launchpadId,
            event.transaction.hash
        )
    }

    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: tokenAddrLower,
    })
    const snap = existingSnapshot ?? defaultSnapshot(tokenAddrLower, chainId, launchpadId)

    const marketCapNative = formatEther(marketCap)
    const prevAthNative = snap.athMarketCapNative ?? '0'

    let { price1dAgo, price1dAgoTimestamp, priceChange1dPct } = snap
    const day = (t: number) => Math.floor(t / 86400)
    if (
        (snap.lastSwapAt ?? 0) > 0 &&
        (!snap.price1dAgoTimestamp || day(timestamp) > day(snap.price1dAgoTimestamp))
    ) {
        price1dAgo = snap.lastPrice ?? '0'
        price1dAgoTimestamp = snap.lastSwapAt
    }
    const pastPrice = parseFloat(price1dAgo ?? '0')
    if (pastPrice > 0 && price > 0) {
        priceChange1dPct = (((price - pastPrice) / pastPrice) * 100).toString()
    }

    const values = {
        lastPrice: price > 0 ? price.toString() : (snap.lastPrice ?? '0'),
        lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : (snap.lastPriceUsd ?? '0'),
        marketCapNative,
        athMarketCapNative: marketCap > parseEther(prevAthNative) ? marketCapNative : prevAthNative,
        totalBuys: (snap.totalBuys ?? 0) + (isBuy ? 1 : 0),
        totalSells: (snap.totalSells ?? 0) + (isBuy ? 0 : 1),
        totalVolumeNative: (BigInt(snap.totalVolumeNative ?? '0') + volume).toString(),
        creatorFeeNative: (
            BigInt(snap.creatorFeeNative ?? '0') + (creatorFeeNative ?? 0n)
        ).toString(),
        lastSwapAt: timestamp,
        price1dAgo,
        price1dAgoTimestamp,
        priceChange1dPct,
        updatedAt: timestamp,
    }
    if (existingSnapshot) {
        await context.db.update(schema.tokenSnapshot, { tokenAddr: tokenAddrLower }).set(values)
    } else {
        await context.db
            .insert(schema.tokenSnapshot)
            .values({ ...snap, ...values })
            .onConflictDoNothing()
    }
}

async function handleGraduation(args: HandlerArgs, adapter: LaunchpadAdapter) {
    const { context } = args
    const { tokenAddr: raw, ammPool: rawPool } = await adapter.graduation(args)
    const tokenAddr = raw.toLowerCase()

    const existing = await context.db.find(schema.launchToken, { tokenAddr })
    if (!existing) return

    const ammPool = rawPool?.toLowerCase()

    await context.db.update(schema.launchToken, { tokenAddr }).set({
        isGraduated: 1,
        graduatedAt: Number(args.event.block.timestamp),
        ammPool: ammPool ?? null,
    })

    if (ammPool) {
        await context.db
            .insert(schema.graduatedPool)
            .values({ pool: ammPool, chainId: existing.chainId, tokenAddr })
            .onConflictDoNothing()
    }
}

async function handleTransfer({ event, context }: HandlerArgs, chainId: number) {
    const { from, to } = event.args
    const value = BigInt(event.args.value)
    const fromLower = from.toLowerCase()
    const toLower = to.toLowerCase()
    const tokenAddrLower = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)

    const launchToken = await context.db.find(schema.launchToken, { tokenAddr: tokenAddrLower })
    const infra = INFRA_ADDRESSES[chainId]

    const isHolder = (address: string) =>
        address !== zeroAddress && !infra?.has(address) && address !== launchToken?.market
    const fromIsHolder = isHolder(fromLower)
    const toIsHolder = isHolder(toLower)
    if (!fromIsHolder && !toIsHolder) return

    if (fromIsHolder && toIsHolder) {
        await context.db
            .insert(schema.transferEvent)
            .values({
                id: `${chainId}-${event.block.number}-${event.log.logIndex}`,
                chainId,
                tokenAddr: tokenAddrLower,
                from: fromLower,
                to: toLower,
                amount: value.toString(),
                blockNumber: Number(event.block.number),
                timestamp,
                transactionHash: event.transaction.hash,
            })
            .onConflictDoNothing()
    }

    const move = (address: string, delta: bigint) =>
        applyHolderDelta(
            context,
            chainId,
            tokenAddrLower,
            address,
            delta,
            event.transaction.hash,
            timestamp
        )
    const lost = fromIsHolder && (await move(fromLower, -value)).crossedToZero
    const gained = toIsHolder && (await move(toLower, value)).crossedToPositive
    if (!lost && !gained) return

    const snap = await context.db.find(schema.tokenSnapshot, { tokenAddr: tokenAddrLower })
    if (!snap) return
    const prev = snap.holderCount ?? 0
    const holderCount = Math.max(0, prev - (lost ? 1 : 0)) + (gained ? 1 : 0)
    if (holderCount !== prev) {
        await context.db
            .update(schema.tokenSnapshot, { tokenAddr: tokenAddrLower })
            .set({ holderCount })
    }
}

async function applyHolderDelta(
    context: any,
    chainId: number,
    tokenAddr: string,
    address: string,
    delta: bigint,
    txHash: string,
    timestamp: number
) {
    const id = `${chainId}-${tokenAddr}-${address}`
    const existing = await context.db.find(schema.tokenHolder, { id })
    const oldBalance = existing ? BigInt(existing.balance) : 0n
    let newBalance = oldBalance + delta

    if (newBalance < 0n) {
        console.warn(`negative balance for ${address} on ${tokenAddr}: ${newBalance}, clamping`)
        newBalance = 0n
    }

    const balance = newBalance.toString()
    await context.db
        .insert(schema.tokenHolder)
        .values({ id, chainId, tokenAddr, address, balance })
        .onConflictDoUpdate({ balance })
    await applyPnlTransfer(
        context,
        chainId,
        tokenAddr,
        address,
        oldBalance,
        newBalance,
        txHash,
        timestamp
    )

    return {
        crossedToPositive: oldBalance <= 0n && newBalance > 0n,
        crossedToZero: oldBalance > 0n && newBalance <= 0n,
    }
}

type DynamicEvent = Parameters<typeof ponder.on>[0]

for (const { chainSlug, launchpad } of enabledLaunchpads()) {
    const adapter = getAdapter(launchpad.launchpadId)
    const names = contractNames(launchpad.launchpadId, chainSlug)
    const { creation, swaps, graduation } = adapter.bindings
    const bind = (contract: string, event: string) => `${contract}:${event}` as DynamicEvent

    ponder.on(bind(contractNameFor(names, creation.contract), creation.event), (args) =>
        handleCreation(args, launchpad, adapter)
    )
    for (const swap of swaps) {
        ponder.on(bind(contractNameFor(names, swap.contract), swap.event), (args) =>
            handleSwap(args, launchpad, adapter, swap.isBuy)
        )
    }
    ponder.on(bind(contractNameFor(names, graduation.contract), graduation.event), (args) =>
        handleGraduation(args, adapter)
    )
    ponder.on(bind(names.token, 'Transfer'), (args) => handleTransfer(args, launchpad.chainId))
}

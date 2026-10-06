import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther } from 'viem'
import { readERC20Metadata } from './erc20-read.js'
import { foldTokenCandle } from './candles.js'
import { readTrackingTag } from '@coshi190/juno-moneta-sdk'
import { getChains, getStablecoins, getWrappedNativeAddress } from './registry.js'
import { abs, countsTowardStats, parseV3Swap } from './parse-swaps.js'
import {
    sanitizeUsdPrice,
    computePriceFromSqrtPriceX96,
    MAX_NATIVE_USD_PRICE,
    MAX_TOKEN_USD_PRICE,
} from './price-history.js'
import { recordUserSwap } from './user-pnl.js'

type DynamicEvent = Parameters<typeof ponder.on>[0]
type Pool = { token0: string; token1: string }
type Side = { tokenAddr: string; tokenIsToken0: boolean } | null

const GRADUATED_FEE_TIER = 10000
const SECONDS_PER_DAY = 86400

export async function upsertToken(
    context: any,
    chainId: number,
    address: string,
    timestamp: number
) {
    const id = `${chainId}-${address}`
    if (await context.db.find(schema.v3Token, { id })) return
    const meta = await readERC20Metadata(context.client, address)
    await context.db
        .insert(schema.v3Token)
        .values({ id, chainId, address, ...meta, createdAt: timestamp })
        .onConflictDoNothing()
}

function getDayTimestamp(timestamp: number): number {
    return Math.floor(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY
}

// The non-native token of a pool paired with wrapped native, or null.
function nativeSide(pool: Pool, wn: string | undefined): Side {
    if (pool.token1 === wn) return { tokenAddr: pool.token0, tokenIsToken0: true }
    if (pool.token0 === wn) return { tokenAddr: pool.token1, tokenIsToken0: false }
    return null
}

async function getNativeUsd(context: any, chainId: number): Promise<number> {
    const rec = await context.db.find(schema.nativeUsdPrice, { chainId })
    return rec ? parseFloat(rec.price) : 0
}

async function decimalsOf(context: any, chainId: number, addr: string): Promise<number> {
    const token = await context.db.find(schema.v3Token, { id: `${chainId}-${addr}` })
    return token?.decimals ?? 18
}

async function swapVolumeUsd(
    context: any,
    chainId: number,
    pool: Pool,
    side: Side,
    amount0: bigint,
    amount1: bigint,
    nativeUsd: number
): Promise<number> {
    if (side) return Number(formatEther(abs(side.tokenIsToken0 ? amount1 : amount0))) * nativeUsd
    const legs = [
        [pool.token0, abs(amount0)],
        [pool.token1, abs(amount1)],
    ] as const
    const stables = getStablecoins(chainId)
    const stable = legs.find(([addr]) => stables?.has(addr))
    if (stable) return Number(stable[1]) / 10 ** (await decimalsOf(context, chainId, stable[0]))
    for (const [addr, amount] of legs) {
        const snap = await context.db.find(schema.v3TokenSnapshot, { id: `${chainId}-${addr}` })
        const priceUsd = parseFloat(snap?.lastPriceUsd ?? '0')
        if (priceUsd > 0) {
            return (Number(amount) / 10 ** (await decimalsOf(context, chainId, addr))) * priceUsd
        }
    }
    return 0
}

async function upsertPoolDayVolume(
    context: any,
    chainId: number,
    poolAddress: string,
    timestamp: number,
    volumeUsd: number
) {
    const dayTimestamp = getDayTimestamp(timestamp)
    await context.db
        .insert(schema.v3PoolDayVolume)
        .values({
            id: `${chainId}-${poolAddress}-${dayTimestamp}`,
            chainId,
            poolAddress,
            dayTimestamp,
            volumeUsd,
            swapCount: 1,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate((row: any) => ({
            volumeUsd: row.volumeUsd + volumeUsd,
            swapCount: row.swapCount + 1,
            updatedAt: timestamp,
        }))
}

// Swap args carry the new price state; Mint/Collect args don't, so it falls back to prev.
async function applyReserveDelta(context: any, chainId: number, event: any, sign: 1n | -1n) {
    const { amount0, amount1, sqrtPriceX96, liquidity, tick } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const clamp = (x: bigint) => (x < 0n ? 0n : x)
    const tk = tick !== undefined ? Number(tick) : undefined
    await context.db
        .insert(schema.v3PoolState)
        .values({
            id: `${chainId}-${poolAddress}`,
            chainId,
            poolAddress,
            reserve0: clamp(sign * amount0).toString(),
            reserve1: clamp(sign * amount1).toString(),
            sqrtPriceX96: sqrtPriceX96?.toString() ?? '0',
            tick: tk ?? null,
            liquidity: liquidity?.toString() ?? '0',
            updatedAt: Number(event.block.timestamp),
        })
        .onConflictDoUpdate((prev: any) => ({
            reserve0: clamp(BigInt(prev.reserve0) + sign * amount0).toString(),
            reserve1: clamp(BigInt(prev.reserve1) + sign * amount1).toString(),
            sqrtPriceX96: sqrtPriceX96?.toString() ?? prev.sqrtPriceX96,
            tick: tk ?? prev.tick,
            liquidity: liquidity?.toString() ?? prev.liquidity,
            updatedAt: Number(event.block.timestamp),
        }))
}

async function updateNativeUsdPrice(
    context: any,
    chainId: number,
    poolAddress: string,
    side: Side,
    event: any
) {
    if (!side || !getStablecoins(chainId)?.has(side.tokenAddr)) return
    const stableDecimals = await decimalsOf(context, chainId, side.tokenAddr)
    const price = computePriceFromSqrtPriceX96(
        event.args.sqrtPriceX96,
        !side.tokenIsToken0,
        18,
        stableDecimals
    )
    if (sanitizeUsdPrice(price, MAX_NATIVE_USD_PRICE) === null) return

    const timestamp = Number(event.block.timestamp)
    const row = { price: price.toString(), poolAddress, updatedAt: timestamp }
    await context.db
        .insert(schema.nativeUsdPrice)
        .values({ chainId, ...row })
        .onConflictDoUpdate(row)
    await context.db
        .insert(schema.nativeUsdPriceSnapshot)
        .values({
            id: `${chainId}-${event.block.number}-${event.log.logIndex}`,
            chainId,
            price: row.price,
            timestamp,
            blockNumber: Number(event.block.number),
        })
        .onConflictDoNothing()
}

async function updateV3TokenSnapshot(
    context: any,
    chainId: number,
    side: Side,
    sqrtPriceX96: bigint,
    timestamp: number,
    nativeUsd: number
) {
    if (!side) return
    const { tokenAddr, tokenIsToken0 } = side
    const decimals = await decimalsOf(context, chainId, tokenAddr)
    const priceNative = computePriceFromSqrtPriceX96(sqrtPriceX96, tokenIsToken0, decimals, 18)
    const rawPriceUsd = nativeUsd > 0 ? priceNative * nativeUsd : 0
    const priceUsd = sanitizeUsdPrice(rawPriceUsd, MAX_TOKEN_USD_PRICE) ?? 0
    const row = {
        lastPriceNative: priceNative.toString(),
        lastPriceUsd: priceUsd.toString(),
        lastSwapAt: timestamp,
        updatedAt: timestamp,
    }
    await context.db
        .insert(schema.v3TokenSnapshot)
        .values({ id: `${chainId}-${tokenAddr}`, chainId, tokenAddr, ...row })
        .onConflictDoUpdate(row)
}

export async function refreshV3TokenPrice(context: any, chainId: number, pool: Pool, event: any) {
    const side = nativeSide(pool, getWrappedNativeAddress(chainId))
    const nativeUsd = await getNativeUsd(context, chainId)
    const timestamp = Number(event.block.timestamp)
    await updateV3TokenSnapshot(
        context,
        chainId,
        side,
        event.args.sqrtPriceX96,
        timestamp,
        nativeUsd
    )
}

export async function recordV3SwapEvent(
    context: any,
    chainId: number,
    event: any,
    poolRecord: Pool,
    poolAddress: string,
    timestamp: number,
    requireNative = true,
    protocol = 'junoswap'
) {
    const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = event.args
    const wn = getWrappedNativeAddress(chainId)
    const { token0, token1 } = poolRecord
    const side =
        nativeSide(poolRecord, wn) ??
        (requireNative ? null : { tokenAddr: token0, tokenIsToken0: true })
    if (!side) return
    const { tokenAddr, tokenIsToken0 } = side

    const txFrom = event.transaction.from.toLowerCase()
    const blockNumber = Number(event.block.number)
    const tag = readTrackingTag(event.transaction.input, event.transaction.from)
    await context.db
        .insert(schema.v3SwapEvent)
        .values({
            id: `${chainId}-${event.block.number}-${event.log.logIndex}`,
            chainId,
            poolAddress,
            tokenAddr,
            tokenIsToken0: tokenIsToken0 ? 1 : 0,
            token0Addr: token0,
            token1Addr: token1,
            sender: sender.toLowerCase(),
            recipient: recipient.toLowerCase(),
            txFrom,
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            sqrtPriceX96: sqrtPriceX96.toString(),
            liquidity: liquidity.toString(),
            tick: Number(tick),
            blockNumber,
            timestamp,
            transactionHash: event.transaction.hash,
            viaFrontend: tag ? 1 : 0,
            referrer: tag?.referrer ?? null,
            protocol,
        })
        .onConflictDoNothing()

    if (tag?.binding) {
        await context.db
            .insert(schema.referralBinding)
            .values({
                referee: tag.binding.referee,
                referrer: tag.binding.referrer,
                boundAtBlock: blockNumber,
                boundAtTimestamp: Number(event.block.timestamp),
                chainId,
            })
            .onConflictDoNothing()
    }

    if (!wn) return
    const parsed = parseV3Swap(
        {
            tokenAddr,
            txFrom,
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            token0Addr: token0,
            token1Addr: token1,
            timestamp,
            protocol,
        },
        wn
    )
    if (!parsed) return

    const decimals = await decimalsOf(context, chainId, parsed.tokenAddr)
    if (countsTowardStats(protocol, !!tag)) {
        await recordUserSwap(
            context,
            chainId,
            parsed.tokenAddr,
            parsed.sender,
            parsed.isBuy,
            parsed.amountIn,
            parsed.grossAmountIn,
            parsed.amountOut,
            decimals,
            await getNativeUsd(context, chainId),
            timestamp,
            parsed.protocol,
            event.transaction.hash
        )
    }
    const priceNative = computePriceFromSqrtPriceX96(sqrtPriceX96, tokenIsToken0, decimals, 18)
    await foldTokenCandle(context, chainId, parsed.tokenAddr, 'v3', timestamp, priceNative)
}

async function updateGraduatedTokenSnapshot(
    context: any,
    pool: { fee: number },
    side: Side,
    event: any,
    nativeUsd: number
) {
    if (pool.fee !== GRADUATED_FEE_TIER || !side) return
    const { tokenAddr, tokenIsToken0 } = side
    const launchToken = await context.db.find(schema.launchToken, { tokenAddr })
    if (launchToken?.isGraduated !== 1) return
    const snap = await context.db.find(schema.tokenSnapshot, { tokenAddr })
    if (!snap) return

    const { amount0, amount1, sqrtPriceX96 } = event.args
    const timestamp = Number(event.block.timestamp)
    const priceNative = computePriceFromSqrtPriceX96(sqrtPriceX96, tokenIsToken0, 18, 18)
    const marketCap = priceNative * 1_000_000_000
    const priceUsd = nativeUsd > 0 ? priceNative * nativeUsd : 0
    const isBuy = (tokenIsToken0 ? amount0 : amount1) < 0n
    const nativeVolume = abs(tokenIsToken0 ? amount1 : amount0)

    let { price1dAgo, price1dAgoTimestamp, priceChange1dPct } = snap
    if (
        (snap.lastSwapAt ?? 0) > 0 &&
        (!snap.price1dAgoTimestamp ||
            getDayTimestamp(timestamp) > getDayTimestamp(snap.price1dAgoTimestamp))
    ) {
        price1dAgo = snap.lastPrice ?? '0'
        price1dAgoTimestamp = snap.lastSwapAt
    }
    const pastPrice = parseFloat(price1dAgo ?? '0')
    if (pastPrice > 0 && priceNative > 0) {
        priceChange1dPct = (((priceNative - pastPrice) / pastPrice) * 100).toString()
    }

    await context.db.update(schema.tokenSnapshot, { tokenAddr }).set({
        lastPrice: priceNative > 0 ? priceNative.toString() : snap.lastPrice,
        lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : (snap.lastPriceUsd ?? '0'),
        marketCapNative: marketCap.toString(),
        athMarketCapNative: Math.max(
            marketCap,
            parseFloat(snap.athMarketCapNative ?? '0')
        ).toString(),
        totalBuys: (snap.totalBuys ?? 0) + (isBuy ? 1 : 0),
        totalSells: (snap.totalSells ?? 0) + (isBuy ? 0 : 1),
        totalVolumeNative: (BigInt(snap.totalVolumeNative ?? '0') + nativeVolume).toString(),
        lastSwapAt: timestamp,
        price1dAgo,
        price1dAgoTimestamp,
        priceChange1dPct,
        updatedAt: timestamp,
    })
}

async function handlePoolCreated(context: any, chainId: number, event: any) {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()
    await Promise.all([
        upsertToken(context, chainId, t0, timestamp),
        upsertToken(context, chainId, t1, timestamp),
    ])
    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `${chainId}-${address}`,
            chainId,
            address,
            token0: t0,
            token1: t1,
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
            protocol: 'junoswap',
        })
        .onConflictDoNothing()
}

async function handleSwap(context: any, chainId: number, event: any) {
    const { amount0, amount1, sqrtPriceX96 } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const pool = await context.db.find(schema.v3Pool, { id: `${chainId}-${poolAddress}` })
    if (!pool) return
    const side = nativeSide(pool, getWrappedNativeAddress(chainId))

    await applyReserveDelta(context, chainId, event, 1n)
    await updateNativeUsdPrice(context, chainId, poolAddress, side, event)
    const nativeUsd = await getNativeUsd(context, chainId)
    const volumeUsd = await swapVolumeUsd(context, chainId, pool, side, amount0, amount1, nativeUsd)
    await upsertPoolDayVolume(context, chainId, poolAddress, timestamp, volumeUsd)
    await updateV3TokenSnapshot(context, chainId, side, sqrtPriceX96, timestamp, nativeUsd)
    await recordV3SwapEvent(context, chainId, event, pool, poolAddress, timestamp)
    await updateGraduatedTokenSnapshot(context, pool, side, event, nativeUsd)
}

const { kubTestnet, bitkub, jbc } = getChains()
for (const [suffix, chainId] of [
    ['', kubTestnet],
    ['Bitkub', bitkub],
    ['Jbc', jbc],
] as const) {
    ponder.on(`V3Factory${suffix}:PoolCreated` as DynamicEvent, ({ event, context }) =>
        handlePoolCreated(context, chainId, event)
    )
    ponder.on(`V3Pool${suffix}:Swap` as DynamicEvent, ({ event, context }) =>
        handleSwap(context, chainId, event)
    )
    ponder.on(`V3Pool${suffix}:Mint` as DynamicEvent, ({ event, context }) =>
        applyReserveDelta(context, chainId, event, 1n)
    )
    ponder.on(`V3Pool${suffix}:Collect` as DynamicEvent, ({ event, context }) =>
        applyReserveDelta(context, chainId, event, -1n)
    )
}

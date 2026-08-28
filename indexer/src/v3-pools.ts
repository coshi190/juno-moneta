import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther } from 'viem'
import { readERC20Metadata } from './erc20-read.js'
import { foldTokenCandle } from './candles.js'
import {
    parseTrackingTag,
    resolveBinding,
    parseV3Swap,
    getWrappedNativeAddress,
    getStablecoins,
} from '@coshi190/juno-moneta-sdk'
import { sanitizeUsdPrice, MAX_NATIVE_USD_PRICE, MAX_TOKEN_USD_PRICE } from './price-history.js'
import { recordUserSwap } from './user-pnl.js'

const Q96 = 2n ** 96n
const WRAPPED_NATIVE = '0x700d3ba307e1256e509ed3e45d6f9dff441d6907'
const GRADUATED_FEE_TIER = 10000
const SECONDS_PER_DAY = 86400

function computePriceFromSqrtPriceX96(
    sqrtPriceX96: bigint,
    tokenIsToken0: boolean,
    tokenDecimals: number,
    pairedDecimals: number
): number {
    const SCALE = 10n ** 18n
    let scaled: bigint
    if (tokenIsToken0) {
        scaled = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96)
    } else {
        scaled = (Q96 * Q96 * SCALE) / (sqrtPriceX96 * sqrtPriceX96)
    }
    const diff = tokenDecimals - pairedDecimals
    if (diff > 0) {
        scaled = scaled * 10n ** BigInt(diff)
    } else if (diff < 0) {
        scaled = scaled / 10n ** BigInt(-diff)
    }
    return Number(scaled) / 1e18
}

export async function upsertToken(
    context: any,
    chainId: number,
    address: string,
    timestamp: number
) {
    const id = `${chainId}-${address}`
    const existing = await context.db.find(schema.v3Token, { id })
    if (existing) return

    const meta = await readERC20Metadata(context.client, address)

    await context.db
        .insert(schema.v3Token)
        .values({
            id,
            chainId,
            address,
            name: meta.name,
            symbol: meta.symbol,
            decimals: meta.decimals,
            createdAt: timestamp,
        })
        .onConflictDoNothing()
}

function getDayTimestamp(timestamp: number): number {
    return Math.floor(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY
}

async function upsertPoolDayVolume(
    context: any,
    chainId: number,
    poolAddress: string,
    timestamp: number,
    absAmount0: bigint,
    absAmount1: bigint
) {
    const dayTimestamp = getDayTimestamp(timestamp)
    const dayId = `${chainId}-${poolAddress}-${dayTimestamp}`

    const existing = await context.db.find(schema.v3PoolDayVolume, { id: dayId })

    if (!existing) {
        await context.db
            .insert(schema.v3PoolDayVolume)
            .values({
                id: dayId,
                chainId,
                poolAddress,
                dayTimestamp,
                volumeToken0: absAmount0.toString(),
                volumeToken1: absAmount1.toString(),
                swapCount: 1,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    } else {
        const newVol0 = BigInt(existing.volumeToken0) + absAmount0
        const newVol1 = BigInt(existing.volumeToken1) + absAmount1

        await context.db.update(schema.v3PoolDayVolume, { id: dayId }).set({
            volumeToken0: newVol0.toString(),
            volumeToken1: newVol1.toString(),
            swapCount: existing.swapCount + 1,
            updatedAt: timestamp,
        })
    }
}

export async function applyReserveDelta(
    context: any,
    chainId: number,
    poolAddress: string,
    timestamp: number,
    delta0: bigint,
    delta1: bigint,
    sqrtPriceX96?: bigint,
    liquidity?: bigint,
    tick?: number | bigint
) {
    const stateId = `${chainId}-${poolAddress}`
    const prev = await context.db.find(schema.v3PoolState, { id: stateId })

    let reserve0 = (prev ? BigInt(prev.reserve0) : 0n) + delta0
    let reserve1 = (prev ? BigInt(prev.reserve1) : 0n) + delta1
    if (reserve0 < 0n) reserve0 = 0n
    if (reserve1 < 0n) reserve1 = 0n

    const sp = sqrtPriceX96 !== undefined ? sqrtPriceX96.toString() : (prev?.sqrtPriceX96 ?? '0')
    const liq = liquidity !== undefined ? liquidity.toString() : (prev?.liquidity ?? '0')
    const tk = tick !== undefined ? Number(tick) : (prev?.tick ?? null)

    if (!prev) {
        await context.db
            .insert(schema.v3PoolState)
            .values({
                id: stateId,
                chainId,
                poolAddress,
                reserve0: reserve0.toString(),
                reserve1: reserve1.toString(),
                sqrtPriceX96: sp,
                tick: tk,
                liquidity: liq,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    } else {
        await context.db.update(schema.v3PoolState, { id: stateId }).set({
            reserve0: reserve0.toString(),
            reserve1: reserve1.toString(),
            sqrtPriceX96: sp,
            tick: tk,
            liquidity: liq,
            updatedAt: timestamp,
        })
    }

    const dayTimestamp = getDayTimestamp(timestamp)
    const dayId = `${chainId}-${poolAddress}-${dayTimestamp}`
    const dayVals = {
        reserve0: reserve0.toString(),
        reserve1: reserve1.toString(),
        sqrtPriceX96: sp,
        updatedAt: timestamp,
    }
    const existingDay = await context.db.find(schema.v3PoolTvlDay, { id: dayId })
    if (!existingDay) {
        await context.db
            .insert(schema.v3PoolTvlDay)
            .values({ id: dayId, chainId, poolAddress, dayTimestamp, ...dayVals })
            .onConflictDoNothing()
    } else {
        await context.db.update(schema.v3PoolTvlDay, { id: dayId }).set(dayVals)
    }
}

async function handleV3Mint(context: any, chainId: number, event: any) {
    const { amount0, amount1 } = event.args
    await applyReserveDelta(
        context,
        chainId,
        event.log.address.toLowerCase(),
        Number(event.block.timestamp),
        amount0,
        amount1
    )
}

async function handleV3Collect(context: any, chainId: number, event: any) {
    const { amount0, amount1 } = event.args as { amount0: bigint; amount1: bigint }
    await applyReserveDelta(
        context,
        chainId,
        event.log.address.toLowerCase(),
        Number(event.block.timestamp),
        -amount0,
        -amount1
    )
}

async function updateNativeUsdPrice(
    context: any,
    chainId: number,
    poolAddress: string,
    poolRecord: { token0: string; token1: string },
    sqrtPriceX96: bigint,
    timestamp: number,
    blockNumber: number,
    logIndex: number
) {
    const wn = getWrappedNativeAddress(chainId)
    const stables = getStablecoins(chainId)
    if (!wn || !stables) return

    const { token0, token1 } = poolRecord
    let nativeIsToken0 = false
    let isNativeStablePool = false

    if (token0 === wn && stables.has(token1)) {
        nativeIsToken0 = true
        isNativeStablePool = true
    } else if (token1 === wn && stables.has(token0)) {
        nativeIsToken0 = false
        isNativeStablePool = true
    }

    if (!isNativeStablePool) return

    const stableAddr = nativeIsToken0 ? token1 : token0
    const stableToken = await context.db.find(schema.v3Token, { id: `${chainId}-${stableAddr}` })
    const stableDecimals = stableToken?.decimals ?? 18
    const price = computePriceFromSqrtPriceX96(sqrtPriceX96, nativeIsToken0, 18, stableDecimals)

    if (sanitizeUsdPrice(price, MAX_NATIVE_USD_PRICE) === null) return

    await context.db
        .insert(schema.nativeUsdPrice)
        .values({
            chainId,
            price: price.toString(),
            poolAddress,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            price: price.toString(),
            poolAddress,
            updatedAt: timestamp,
        })

    await context.db
        .insert(schema.nativeUsdPriceSnapshot)
        .values({
            id: `${chainId}-${blockNumber}-${logIndex}`,
            chainId,
            price: price.toString(),
            timestamp,
            blockNumber,
        })
        .onConflictDoNothing()
}

async function updateV3TokenSnapshot(
    context: any,
    chainId: number,
    poolAddress: string,
    poolRecord: { token0: string; token1: string },
    sqrtPriceX96: bigint,
    timestamp: number
) {
    const wn = getWrappedNativeAddress(chainId)
    if (!wn) return

    const { token0, token1 } = poolRecord
    let tokenAddr: string | null = null
    let tokenIsToken0 = false

    if (token1 === wn) {
        tokenAddr = token0
        tokenIsToken0 = true
    } else if (token0 === wn) {
        tokenAddr = token1
        tokenIsToken0 = false
    }

    if (!tokenAddr) return

    const tokenRecord = await context.db.find(schema.v3Token, { id: `${chainId}-${tokenAddr}` })
    const tokenDecimals = tokenRecord?.decimals ?? 18
    const priceNative = computePriceFromSqrtPriceX96(sqrtPriceX96, tokenIsToken0, tokenDecimals, 18)

    const nativePrice = await context.db.find(schema.nativeUsdPrice, { chainId })
    const nativeUsd = nativePrice ? parseFloat(nativePrice.price) : 0
    const rawPriceUsd = nativeUsd > 0 ? priceNative * nativeUsd : 0
    const priceUsd = sanitizeUsdPrice(rawPriceUsd, MAX_TOKEN_USD_PRICE) ?? 0

    const id = `${chainId}-${tokenAddr}`
    await context.db
        .insert(schema.v3TokenSnapshot)
        .values({
            id,
            chainId,
            tokenAddr,
            lastPriceNative: priceNative.toString(),
            lastPriceUsd: priceUsd.toString(),
            lastSwapAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            lastPriceNative: priceNative.toString(),
            lastPriceUsd: priceUsd.toString(),
            lastSwapAt: timestamp,
            updatedAt: timestamp,
        })
}

export async function recordV3SwapEvent(
    context: any,
    chainId: number,
    event: any,
    poolRecord: { token0: string; token1: string },
    poolAddress: string,
    timestamp: number,
    requireNative = true,
    protocol = 'junoswap'
) {
    const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = event.args
    const wn = getWrappedNativeAddress(chainId)
    const { token0, token1 } = poolRecord

    let tokenAddr: string
    let tokenIsToken0: boolean
    if (token1 === wn) {
        tokenAddr = token0
        tokenIsToken0 = true
    } else if (token0 === wn) {
        tokenAddr = token1
        tokenIsToken0 = false
    } else if (requireNative) {
        return
    } else {
        tokenAddr = token0
        tokenIsToken0 = true
    }

    const tag = parseTrackingTag(event.transaction.input)
    const id = `${chainId}-${event.block.number}-${event.log.logIndex}`
    await context.db
        .insert(schema.v3SwapEvent)
        .values({
            id,
            chainId,
            poolAddress,
            tokenAddr,
            tokenIsToken0: tokenIsToken0 ? 1 : 0,
            token0Addr: token0,
            token1Addr: token1,
            sender: sender.toLowerCase(),
            recipient: recipient.toLowerCase(),
            txFrom: event.transaction.from.toLowerCase(),
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            sqrtPriceX96: sqrtPriceX96.toString(),
            liquidity: liquidity.toString(),
            tick: Number(tick),
            blockNumber: Number(event.block.number),
            timestamp,
            transactionHash: event.transaction.hash,
            viaFrontend: tag ? 1 : 0,
            referrer: tag?.referrer ?? null,
            protocol,
        })
        .onConflictDoNothing()

    const binding = resolveBinding(event.transaction.from, tag?.referrer ?? null)
    if (binding) {
        await context.db
            .insert(schema.referralBinding)
            .values({
                referee: binding.referee,
                referrer: binding.referrer,
                boundAtBlock: Number(event.block.number),
                boundAtTimestamp: Number(event.block.timestamp),
                chainId,
            })
            .onConflictDoNothing()
    }

    const parsed = wn
        ? parseV3Swap(
              {
                  tokenAddr,
                  txFrom: event.transaction.from.toLowerCase(),
                  amount0: amount0.toString(),
                  amount1: amount1.toString(),
                  token0Addr: token0,
                  token1Addr: token1,
                  timestamp,
                  protocol,
              },
              wn
          )
        : null
    if (parsed) {
        const nativePriceRecord = await context.db.find(schema.nativeUsdPrice, { chainId })
        const nativeUsd = nativePriceRecord ? parseFloat(nativePriceRecord.price) : 0
        const tokenRec = await context.db.find(schema.v3Token, {
            id: `${chainId}-${parsed.tokenAddr}`,
        })
        await recordUserSwap(
            context,
            chainId,
            parsed.tokenAddr,
            parsed.sender,
            parsed.isBuy,
            parsed.amountIn,
            parsed.amountOut,
            tokenRec?.decimals ?? 18,
            nativeUsd,
            timestamp,
            parsed.protocol
        )

        const priceNative = computePriceFromSqrtPriceX96(
            sqrtPriceX96,
            tokenIsToken0,
            tokenRec?.decimals ?? 18,
            18
        )
        const nativeAmount = tokenIsToken0 ? amount1 : amount0
        const volumeNative = Number(formatEther(nativeAmount < 0n ? -nativeAmount : nativeAmount))
        await foldTokenCandle(
            context,
            chainId,
            parsed.tokenAddr,
            'v3',
            timestamp,
            priceNative,
            volumeNative
        )
    }
}

ponder.on('V3Factory:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, 25925, t0, timestamp),
        upsertToken(context, 25925, t1, timestamp),
    ])

    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `25925-${address}`,
            chainId: 25925,
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
})

ponder.on('V3Pool:Swap', async ({ event, context }) => {
    const { amount0, amount1, sqrtPriceX96, liquidity, tick } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1

    await upsertPoolDayVolume(context, 25925, poolAddress, timestamp, absAmount0, absAmount1)

    const poolRecord = await context.db.find(schema.v3Pool, { id: `25925-${poolAddress}` })
    if (!poolRecord) return

    await applyReserveDelta(
        context,
        25925,
        poolAddress,
        timestamp,
        amount0,
        amount1,
        sqrtPriceX96,
        liquidity,
        tick
    )

    await updateNativeUsdPrice(
        context,
        25925,
        poolAddress,
        poolRecord,
        sqrtPriceX96,
        timestamp,
        Number(event.block.number),
        event.log.logIndex
    )

    await updateV3TokenSnapshot(context, 25925, poolAddress, poolRecord, sqrtPriceX96, timestamp)

    await recordV3SwapEvent(context, 25925, event, poolRecord, poolAddress, timestamp)

    const { token0, token1 } = poolRecord

    if (poolRecord.fee !== GRADUATED_FEE_TIER) return

    let launchTokenAddr: string | null = null
    let launchTokenIsToken0 = false

    if (token1 === WRAPPED_NATIVE) {
        const launchToken = await context.db.find(schema.launchToken, { tokenAddr: token0 })
        if (launchToken?.isGraduated === 1) {
            launchTokenAddr = token0
            launchTokenIsToken0 = true
        }
    } else if (token0 === WRAPPED_NATIVE) {
        const launchToken = await context.db.find(schema.launchToken, { tokenAddr: token1 })
        if (launchToken?.isGraduated === 1) {
            launchTokenAddr = token1
            launchTokenIsToken0 = false
        }
    }

    if (!launchTokenAddr) return

    const priceNative = computePriceFromSqrtPriceX96(sqrtPriceX96, launchTokenIsToken0, 18, 18)
    const marketCap = priceNative * 1_000_000_000

    const nativePriceRecord = await context.db.find(schema.nativeUsdPrice, { chainId: 25925 })
    const nativeUsd = nativePriceRecord ? parseFloat(nativePriceRecord.price) : 0
    const priceUsd = nativeUsd > 0 ? priceNative * nativeUsd : 0

    const nativeVolume = launchTokenIsToken0 ? absAmount1 : absAmount0
    const tokenAmount = launchTokenIsToken0 ? amount0 : amount1
    const isBuy = tokenAmount < 0n

    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: launchTokenAddr,
    })
    if (!existingSnapshot) return

    const athMarketCap = Math.max(
        marketCap,
        parseFloat(existingSnapshot.athMarketCapNative ?? '0')
    ).toString()

    let price1dAgo: string | null = existingSnapshot.price1dAgo ?? null
    let price1dAgoTimestamp: number | null = existingSnapshot.price1dAgoTimestamp ?? null
    let priceChange1dPct: string | null = existingSnapshot.priceChange1dPct ?? null

    const currentDayStart = Math.floor(timestamp / 86400) * 86400
    const refDayStart = existingSnapshot.price1dAgoTimestamp
        ? Math.floor(existingSnapshot.price1dAgoTimestamp / 86400) * 86400
        : null

    if (refDayStart === null || currentDayStart > refDayStart) {
        if ((existingSnapshot.lastSwapAt ?? 0) > 0) {
            price1dAgo = existingSnapshot.lastPrice ?? '0'
            price1dAgoTimestamp = existingSnapshot.lastSwapAt ?? null
        }
    }

    if (price1dAgo !== null && price1dAgo !== '0') {
        const pastPrice = parseFloat(price1dAgo)
        if (pastPrice > 0 && priceNative > 0) {
            priceChange1dPct = (((priceNative - pastPrice) / pastPrice) * 100).toString()
        }
    }

    await context.db.update(schema.tokenSnapshot, { tokenAddr: launchTokenAddr }).set({
        lastPrice: priceNative > 0 ? priceNative.toString() : existingSnapshot.lastPrice,
        lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : (existingSnapshot.lastPriceUsd ?? '0'),
        marketCapNative: marketCap.toString(),
        athMarketCapNative: athMarketCap,
        totalBuys: (existingSnapshot.totalBuys ?? 0) + (isBuy ? 1 : 0),
        totalSells: (existingSnapshot.totalSells ?? 0) + (isBuy ? 0 : 1),
        totalVolumeNative: (
            BigInt(existingSnapshot.totalVolumeNative ?? '0') + nativeVolume
        ).toString(),
        lastSwapAt: timestamp,
        price1dAgo,
        price1dAgoTimestamp,
        priceChange1dPct,
        updatedAt: timestamp,
    })
})

ponder.on('V3FactoryBitkub:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, 96, t0, timestamp),
        upsertToken(context, 96, t1, timestamp),
    ])

    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `96-${address}`,
            chainId: 96,
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
})

ponder.on('V3PoolBitkub:Swap', async ({ event, context }) => {
    const { sqrtPriceX96, liquidity, tick } = event.args
    const { amount0, amount1 } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1

    await upsertPoolDayVolume(context, 96, poolAddress, timestamp, absAmount0, absAmount1)

    const poolRecord = await context.db.find(schema.v3Pool, { id: `96-${poolAddress}` })
    if (!poolRecord) return

    await applyReserveDelta(
        context,
        96,
        poolAddress,
        timestamp,
        amount0,
        amount1,
        sqrtPriceX96,
        liquidity,
        tick
    )

    await updateNativeUsdPrice(
        context,
        96,
        poolAddress,
        poolRecord,
        sqrtPriceX96,
        timestamp,
        Number(event.block.number),
        event.log.logIndex
    )
    await updateV3TokenSnapshot(context, 96, poolAddress, poolRecord, sqrtPriceX96, timestamp)
    await recordV3SwapEvent(context, 96, event, poolRecord, poolAddress, timestamp)
})

ponder.on('V3FactoryJbc:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, 8899, t0, timestamp),
        upsertToken(context, 8899, t1, timestamp),
    ])

    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `8899-${address}`,
            chainId: 8899,
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
})

ponder.on('V3PoolJbc:Swap', async ({ event, context }) => {
    const { sqrtPriceX96, liquidity, tick } = event.args
    const { amount0, amount1 } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1

    await upsertPoolDayVolume(context, 8899, poolAddress, timestamp, absAmount0, absAmount1)

    const poolRecord = await context.db.find(schema.v3Pool, { id: `8899-${poolAddress}` })
    if (!poolRecord) return

    await applyReserveDelta(
        context,
        8899,
        poolAddress,
        timestamp,
        amount0,
        amount1,
        sqrtPriceX96,
        liquidity,
        tick
    )

    await updateNativeUsdPrice(
        context,
        8899,
        poolAddress,
        poolRecord,
        sqrtPriceX96,
        timestamp,
        Number(event.block.number),
        event.log.logIndex
    )
    await updateV3TokenSnapshot(context, 8899, poolAddress, poolRecord, sqrtPriceX96, timestamp)
    await recordV3SwapEvent(context, 8899, event, poolRecord, poolAddress, timestamp)
})

ponder.on('V3Pool:Mint', ({ event, context }) => handleV3Mint(context, 25925, event))
ponder.on('V3Pool:Collect', ({ event, context }) => handleV3Collect(context, 25925, event))
ponder.on('V3PoolBitkub:Mint', ({ event, context }) => handleV3Mint(context, 96, event))
ponder.on('V3PoolBitkub:Collect', ({ event, context }) => handleV3Collect(context, 96, event))
ponder.on('V3PoolJbc:Mint', ({ event, context }) => handleV3Mint(context, 8899, event))
ponder.on('V3PoolJbc:Collect', ({ event, context }) => handleV3Collect(context, 8899, event))

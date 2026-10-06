import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { readTrackingTag } from '@coshi190/juno-moneta-sdk'
import { getSeedV2Pool, getWrappedNativeAddress, V2_DEX_CHAIN } from './registry.js'
import { parseV2Swap } from './parse-swaps.js'
import { upsertToken } from './v3-pools.js'
import { recordUserSwap } from './user-pnl.js'

type DynamicEvent = Parameters<typeof ponder.on>[0]

async function insertV2Pool(
    context: any,
    chainId: number,
    event: any,
    address: string,
    token0: string,
    token1: string,
    protocol: string
) {
    const timestamp = Number(event.block.timestamp)
    await Promise.all([
        upsertToken(context, chainId, token0, timestamp),
        upsertToken(context, chainId, token1, timestamp),
    ])
    await context.db
        .insert(schema.v2Pool)
        .values({
            id: `${chainId}-${address}`,
            chainId,
            address,
            token0,
            token1,
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
            protocol,
        })
        .onConflictDoNothing()
}

async function getOrSeedV2Pool(
    context: any,
    chainId: number,
    event: any,
    address: string
): Promise<{ token0: string; token1: string } | null> {
    const existing = await context.db.find(schema.v2Pool, { id: `${chainId}-${address}` })
    if (existing) return existing
    const s = getSeedV2Pool(chainId, address)
    if (!s) return null
    await insertV2Pool(context, chainId, event, address, s.token0, s.token1, s.dex)
    return s
}

async function recordV2Pool(context: any, chainId: number, event: any, dex: string) {
    const { token0, token1, pair } = event.args
    const [address, t0, t1] = [pair, token0, token1].map((a: string) => a.toLowerCase())
    await insertV2Pool(context, chainId, event, address, t0, t1, dex)
}

async function recordV2SwapEvent(context: any, chainId: number, event: any, dex: string) {
    const tag = readTrackingTag(event.transaction.input, event.transaction.from)
    if (!tag) return

    const poolAddress = event.log.address.toLowerCase()
    const pool = await getOrSeedV2Pool(context, chainId, event, poolAddress)
    if (!pool) return

    const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = event.args
    const blockNumber = Number(event.block.number)
    const timestamp = Number(event.block.timestamp)
    const row = {
        txFrom: event.transaction.from.toLowerCase(),
        token0Addr: pool.token0,
        token1Addr: pool.token1,
        amount0In: amount0In.toString(),
        amount1In: amount1In.toString(),
        amount0Out: amount0Out.toString(),
        amount1Out: amount1Out.toString(),
        timestamp,
        protocol: dex,
    }

    await context.db
        .insert(schema.v2SwapEvent)
        .values({
            ...row,
            id: `${chainId}-${event.block.number}-${event.log.logIndex}`,
            chainId,
            poolAddress,
            tokenAddr: pool.token0,
            sender: sender.toLowerCase(),
            to: to.toLowerCase(),
            blockNumber,
            transactionHash: event.transaction.hash,
            viaFrontend: 1,
            referrer: tag.referrer,
        })
        .onConflictDoNothing()

    if (tag.binding) {
        await context.db
            .insert(schema.referralBinding)
            .values({
                referee: tag.binding.referee,
                referrer: tag.binding.referrer,
                boundAtBlock: blockNumber,
                boundAtTimestamp: timestamp,
                chainId,
            })
            .onConflictDoNothing()
    }

    const wn = getWrappedNativeAddress(chainId)
    const parsed = wn ? parseV2Swap(row, wn) : null
    if (!parsed) return

    const nativePrice = await context.db.find(schema.nativeUsdPrice, { chainId })
    const tokenRec = await context.db.find(schema.v3Token, { id: `${chainId}-${parsed.tokenAddr}` })
    await recordUserSwap(
        context,
        chainId,
        parsed.tokenAddr,
        parsed.sender,
        parsed.isBuy,
        parsed.amountIn,
        parsed.grossAmountIn,
        parsed.amountOut,
        tokenRec?.decimals ?? 18,
        nativePrice ? parseFloat(nativePrice.price) : 0,
        timestamp,
        parsed.protocol,
        event.transaction.hash
    )
}

for (const [dex, chainId] of Object.entries(V2_DEX_CHAIN)) {
    const name = dex.charAt(0).toUpperCase() + dex.slice(1)
    ponder.on(`${name}Factory:PairCreated` as DynamicEvent, ({ event, context }) =>
        recordV2Pool(context, chainId, event, dex)
    )
    for (const contract of ['PairSeeded', 'Pair']) {
        ponder.on(`${name}${contract}:Swap` as DynamicEvent, ({ event, context }) =>
            recordV2SwapEvent(context, chainId, event, dex)
        )
    }
}

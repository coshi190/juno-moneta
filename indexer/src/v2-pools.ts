import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import {
    parseTrackingTag,
    resolveBinding,
    parseV2Swap,
    WRAPPED_NATIVE_ADDRESSES,
} from '@coshi190/junoswap-sdk'
import { upsertToken } from './v3-pools.js'
import { getSeedV2Pool, getSeedV2Dex } from './seed.js'
import { recordUserSwap } from './user-pnl.js'

async function getOrSeedV2Pool(context: any, chainId: number, poolAddress: string, event: any) {
    const id = `${chainId}-${poolAddress}`
    const existing = await context.db.find(schema.v2Pool, { id })
    if (existing) return existing as { token0: string; token1: string }

    const s = getSeedV2Pool(chainId, poolAddress)
    if (!s) return null

    const timestamp = Number(event.block.timestamp)
    await upsertToken(context, chainId, s.token0, timestamp)
    await upsertToken(context, chainId, s.token1, timestamp)
    await context.db
        .insert(schema.v2Pool)
        .values({
            id,
            chainId,
            address: poolAddress,
            token0: s.token0,
            token1: s.token1,
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
            protocol: s.dex,
        })
        .onConflictDoNothing()
    return s
}

async function recordV2Pool(context: any, chainId: number, event: any, dex: string) {
    const { token0, token1, pair } = event.args
    const address = pair.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, chainId, t0, timestamp),
        upsertToken(context, chainId, t1, timestamp),
    ])

    await context.db
        .insert(schema.v2Pool)
        .values({
            id: `${chainId}-${address}`,
            chainId,
            address,
            token0: t0,
            token1: t1,
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
            protocol: dex,
        })
        .onConflictDoNothing()
}

async function recordV2SwapEvent(context: any, chainId: number, event: any, dex: string) {
    const tag = parseTrackingTag(event.transaction.input)
    if (!tag) return

    const poolAddress = event.log.address.toLowerCase()
    const poolRecord = await getOrSeedV2Pool(context, chainId, poolAddress, event)
    if (!poolRecord) return

    const { token0, token1 } = poolRecord
    const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = event.args
    const timestamp = Number(event.block.timestamp)
    const id = `${chainId}-${event.block.number}-${event.log.logIndex}`

    const protocol = getSeedV2Dex(chainId, poolAddress) ?? dex

    await context.db
        .insert(schema.v2SwapEvent)
        .values({
            id,
            chainId,
            poolAddress,
            tokenAddr: token0,
            tokenIsToken0: 1,
            token0Addr: token0,
            token1Addr: token1,
            sender: sender.toLowerCase(),
            to: to.toLowerCase(),
            txFrom: event.transaction.from.toLowerCase(),
            amount0In: amount0In.toString(),
            amount1In: amount1In.toString(),
            amount0Out: amount0Out.toString(),
            amount1Out: amount1Out.toString(),
            blockNumber: Number(event.block.number),
            timestamp,
            transactionHash: event.transaction.hash,
            viaFrontend: 1,
            referrer: tag.referrer,
            protocol,
        })
        .onConflictDoNothing()

    const binding = resolveBinding(event.transaction.from, tag.referrer)
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

    const wn = WRAPPED_NATIVE_ADDRESSES[chainId]
    const parsed = wn
        ? parseV2Swap(
              {
                  txFrom: event.transaction.from.toLowerCase(),
                  token0Addr: token0,
                  token1Addr: token1,
                  amount0In: amount0In.toString(),
                  amount1In: amount1In.toString(),
                  amount0Out: amount0Out.toString(),
                  amount1Out: amount1Out.toString(),
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
    }
}

ponder.on('JibswapFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 8899, event, 'jibswap')
})
ponder.on('JibswapPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 8899, event, 'jibswap')
})
ponder.on('JibswapPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 8899, event, 'jibswap')
})

ponder.on('UdonswapFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 96, event, 'udonswap')
})
ponder.on('UdonswapPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'udonswap')
})
ponder.on('UdonswapPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'udonswap')
})

ponder.on('PonderFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 96, event, 'ponder')
})
ponder.on('PonderPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'ponder')
})
ponder.on('PonderPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'ponder')
})

ponder.on('DiamonFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 96, event, 'diamon')
})
ponder.on('DiamonPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'diamon')
})
ponder.on('DiamonPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'diamon')
})

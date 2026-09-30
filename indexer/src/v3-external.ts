import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { readTrackingTag } from '@coshi190/juno-moneta-sdk'
import { getChains } from './config.js'
import { getSeedV3Pool } from './seed.js'
import { upsertToken, recordV3SwapEvent, refreshV3TokenPrice } from './v3-pools.js'

type DynamicEvent = Parameters<typeof ponder.on>[0]
type PoolInfo = { token0: string; token1: string; fee: number; tickSpacing: number }

const CHAIN = getChains().bitkub

async function insertPool(context: any, event: any, address: string, p: PoolInfo) {
    const timestamp = Number(event.block.timestamp)
    await Promise.all([
        upsertToken(context, CHAIN, p.token0, timestamp),
        upsertToken(context, CHAIN, p.token1, timestamp),
    ])
    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `${CHAIN}-${address}`,
            chainId: CHAIN,
            address,
            ...p,
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
            protocol: 'kublerx',
        })
        .onConflictDoNothing()
}

async function getOrSeedPool(
    context: any,
    event: any,
    address: string
): Promise<{ token0: string; token1: string } | null> {
    const existing = await context.db.find(schema.v3Pool, { id: `${CHAIN}-${address}` })
    if (existing) return existing
    const s = getSeedV3Pool(address)
    if (!s) return null
    await insertPool(context, event, address, s)
    return s
}

ponder.on('KublerxV3Factory:PoolCreated', ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    return insertPool(context, event, pool.toLowerCase(), {
        token0: token0.toLowerCase(),
        token1: token1.toLowerCase(),
        fee: Number(fee),
        tickSpacing: Number(tickSpacing),
    })
})

for (const contract of ['KublerxV3PoolSeeded', 'KublerxV3Pool']) {
    ponder.on(`${contract}:Swap` as DynamicEvent, async ({ event, context }) => {
        const address = event.log.address.toLowerCase()
        const tagged = readTrackingTag(event.transaction.input, event.transaction.from)
        if (!tagged && !(await context.db.find(schema.graduatedPool, { pool: address }))) return
        const pool = await getOrSeedPool(context, event, address)
        if (!pool) return
        const timestamp = Number(event.block.timestamp)
        await refreshV3TokenPrice(context, CHAIN, pool, event)
        await recordV3SwapEvent(context, CHAIN, event, pool, address, timestamp, false, 'kublerx')
    })
}

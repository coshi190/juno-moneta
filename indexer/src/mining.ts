import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { computeIncentiveId } from '@coshi190/junoswap-sdk'
import { upsertToken } from './v3-pools.js'
import { readV3PoolImmutables } from './erc20-read.js'

async function ensurePool(
    context: any,
    chainId: number,
    pool: string,
    timestamp: number,
    block: number
) {
    const id = `${chainId}-${pool}`
    if (await context.db.find(schema.v3Pool, { id })) return

    const immutables = await readV3PoolImmutables(chainId, pool)
    if (!immutables) return

    await upsertToken(context, chainId, immutables.token0, timestamp)
    await upsertToken(context, chainId, immutables.token1, timestamp)
    await context.db
        .insert(schema.v3Pool)
        .values({
            id,
            chainId,
            address: pool,
            token0: immutables.token0,
            token1: immutables.token1,
            fee: immutables.fee,
            tickSpacing: immutables.tickSpacing,
            createdAtBlock: block,
            createdAtTimestamp: timestamp,
            protocol: 'junoswap',
        })
        .onConflictDoNothing()
}

async function handleIncentiveCreated(context: any, chainId: number, event: any) {
    const { rewardToken, pool, startTime, endTime, refundee, reward } = event.args
    const timestamp = Number(event.block.timestamp)
    const block = Number(event.block.number)

    const incentiveId = computeIncentiveId({
        rewardToken,
        pool,
        startTime: Number(startTime),
        endTime: Number(endTime),
        refundee,
    })

    const rewardTokenAddr = rewardToken.toLowerCase()
    const poolAddr = pool.toLowerCase()

    await upsertToken(context, chainId, rewardTokenAddr, timestamp)
    await ensurePool(context, chainId, poolAddr, timestamp, block)

    await context.db
        .insert(schema.incentive)
        .values({
            id: `${chainId}-${incentiveId}`,
            chainId,
            incentiveId,
            rewardToken: rewardTokenAddr,
            pool: poolAddr,
            startTime: Number(startTime),
            endTime: Number(endTime),
            refundee: refundee.toLowerCase(),
            reward: reward.toString(),
            refunded: '0',
            endedAt: null,
            createdAtBlock: block,
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
}

async function handleIncentiveEnded(context: any, chainId: number, event: any) {
    const { incentiveId, refund } = event.args
    const id = `${chainId}-${incentiveId}`
    if (!(await context.db.find(schema.incentive, { id }))) return
    await context.db.update(schema.incentive, { id }).set({
        refunded: refund.toString(),
        endedAt: Number(event.block.timestamp),
    })
}

async function handleDepositTransferred(context: any, chainId: number, event: any) {
    const { tokenId, newOwner } = event.args
    const owner = newOwner.toLowerCase()
    const updatedAt = Number(event.block.timestamp)

    await context.db
        .insert(schema.deposit)
        .values({
            id: `${chainId}-${tokenId}`,
            chainId,
            tokenId: tokenId.toString(),
            owner,
            updatedAt,
        })
        .onConflictDoUpdate({ owner, updatedAt })
}

ponder.on('V3Staker:IncentiveCreated', ({ event, context }) =>
    handleIncentiveCreated(context, 25925, event)
)
ponder.on('V3Staker:IncentiveEnded', ({ event, context }) =>
    handleIncentiveEnded(context, 25925, event)
)
ponder.on('V3Staker:DepositTransferred', ({ event, context }) =>
    handleDepositTransferred(context, 25925, event)
)

ponder.on('V3StakerBitkub:IncentiveCreated', ({ event, context }) =>
    handleIncentiveCreated(context, 96, event)
)
ponder.on('V3StakerBitkub:IncentiveEnded', ({ event, context }) =>
    handleIncentiveEnded(context, 96, event)
)
ponder.on('V3StakerBitkub:DepositTransferred', ({ event, context }) =>
    handleDepositTransferred(context, 96, event)
)

ponder.on('V3StakerJbc:IncentiveCreated', ({ event, context }) =>
    handleIncentiveCreated(context, 8899, event)
)
ponder.on('V3StakerJbc:IncentiveEnded', ({ event, context }) =>
    handleIncentiveEnded(context, 8899, event)
)
ponder.on('V3StakerJbc:DepositTransferred', ({ event, context }) =>
    handleDepositTransferred(context, 8899, event)
)

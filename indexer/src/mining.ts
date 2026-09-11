import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { encodeAbiParameters, keccak256, type Address } from 'viem'
import { upsertToken } from './v3-pools.js'

function computeIncentiveId(
    rewardToken: Address,
    pool: Address,
    startTime: bigint,
    endTime: bigint,
    refundee: Address
): `0x${string}` {
    return keccak256(
        encodeAbiParameters(
            [
                { type: 'address', name: 'rewardToken' },
                { type: 'address', name: 'pool' },
                { type: 'uint256', name: 'startTime' },
                { type: 'uint256', name: 'endTime' },
                { type: 'address', name: 'refundee' },
            ],
            [rewardToken, pool, startTime, endTime, refundee]
        )
    )
}

async function handleIncentiveCreated(context: any, chainId: number, event: any) {
    const { rewardToken, pool, startTime, endTime, refundee, reward } = event.args
    const timestamp = Number(event.block.timestamp)
    const block = Number(event.block.number)

    const rewardTokenAddr = rewardToken.toLowerCase()
    const poolAddr = pool.toLowerCase()
    const refundeeAddr = refundee.toLowerCase()
    const endTimeSec = Number(endTime)

    const incentiveId = computeIncentiveId(
        rewardTokenAddr,
        poolAddr,
        startTime,
        endTime,
        refundeeAddr
    )

    await Promise.all([
        upsertToken(context, chainId, rewardTokenAddr, timestamp),
        context.db
            .insert(schema.incentive)
            .values({
                id: `${chainId}-${incentiveId}`,
                chainId,
                incentiveId,
                rewardToken: rewardTokenAddr,
                pool: poolAddr,
                startTime: Number(startTime),
                endTime: endTimeSec,
                refundee: refundeeAddr,
                reward: reward.toString(),
                refunded: '0',
                endedAt: endTimeSec,
                createdAtBlock: block,
                createdAtTimestamp: timestamp,
            })
            .onConflictDoNothing(),
    ])
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
ponder.on('V3Staker:DepositTransferred', ({ event, context }) =>
    handleDepositTransferred(context, 25925, event)
)

ponder.on('V3StakerBitkub:IncentiveCreated', ({ event, context }) =>
    handleIncentiveCreated(context, 96, event)
)
ponder.on('V3StakerBitkub:DepositTransferred', ({ event, context }) =>
    handleDepositTransferred(context, 96, event)
)

ponder.on('V3StakerJbc:IncentiveCreated', ({ event, context }) =>
    handleIncentiveCreated(context, 8899, event)
)
ponder.on('V3StakerJbc:DepositTransferred', ({ event, context }) =>
    handleDepositTransferred(context, 8899, event)
)

import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { zeroAddress } from 'viem'
import { contractNames, enabledLaunchpads } from './launchpads/index.js'
import type { HandlerArgs } from './launchpads/types.js'

const bucketId = (chainId: number, account: string, asset: string, tokenAddr: string) =>
    `${chainId}-${account}-${asset}-${tokenAddr}`

const accountId = (chainId: number, account: string, asset: string) =>
    `${chainId}-${account}-${asset}`

async function handleFeeShared({ event, context }: HandlerArgs, chainId: number) {
    const { tokenAddr: rawToken, creator, creatorAmount, isNative } = event.args
    const amount = BigInt(creatorAmount)
    if (amount === 0n) return

    const tokenAddr = rawToken.toLowerCase()
    const account = creator.toLowerCase()
    const asset = isNative ? zeroAddress : tokenAddr

    const snap = await context.db.find(schema.tokenSnapshot, { tokenAddr })
    if (snap) {
        await context.db.update(schema.tokenSnapshot, { tokenAddr }).set(
            isNative
                ? {
                      creatorFeeNative: (
                          BigInt(snap.creatorFeeNative ?? '0') + amount
                      ).toString(),
                  }
                : { creatorFeeToken: (BigInt(snap.creatorFeeToken ?? '0') + amount).toString() }
        )
    }

    const id = bucketId(chainId, account, asset, tokenAddr)
    const bucket = await context.db.find(schema.feeBucket, { id })
    if (bucket) {
        await context.db
            .update(schema.feeBucket, { id })
            .set({ amount: (BigInt(bucket.amount) + amount).toString() })
        return
    }

    await context.db
        .insert(schema.feeBucket)
        .values({ id, chainId, account, asset, tokenAddr, amount: amount.toString() })
        .onConflictDoNothing()

    const accId = accountId(chainId, account, asset)
    const existing = await context.db.find(schema.feeAccount, { id: accId })
    if (!existing) {
        await context.db
            .insert(schema.feeAccount)
            .values({
                id: accId,
                chainId,
                account,
                asset,
                tokens: JSON.stringify([tokenAddr]),
            })
            .onConflictDoNothing()
        return
    }
    const tokens = JSON.parse(existing.tokens) as string[]
    if (tokens.includes(tokenAddr)) return
    await context.db
        .update(schema.feeAccount, { id: accId })
        .set({ tokens: JSON.stringify([...tokens, tokenAddr]) })
}

async function handleClaimed({ event, context }: HandlerArgs, chainId: number) {
    const account = event.args.account.toLowerCase()
    const asset = event.args.tokenAddr.toLowerCase()

    const acc = await context.db.find(schema.feeAccount, {
        id: accountId(chainId, account, asset),
    })
    if (!acc) return

    const isNative = asset === zeroAddress
    for (const tokenAddr of JSON.parse(acc.tokens) as string[]) {
        const id = bucketId(chainId, account, asset, tokenAddr)
        const bucket = await context.db.find(schema.feeBucket, { id })
        if (!bucket) continue
        const amount = BigInt(bucket.amount)
        if (amount === 0n) continue

        await context.db.update(schema.feeBucket, { id }).set({ amount: '0' })

        const snap = await context.db.find(schema.tokenSnapshot, { tokenAddr })
        if (!snap) continue
        await context.db.update(schema.tokenSnapshot, { tokenAddr }).set(
            isNative
                ? {
                      creatorFeeClaimedNative: (
                          BigInt(snap.creatorFeeClaimedNative ?? '0') + amount
                      ).toString(),
                  }
                : {
                      creatorFeeClaimedToken: (
                          BigInt(snap.creatorFeeClaimedToken ?? '0') + amount
                      ).toString(),
                  }
        )
    }
}

type DynamicEvent = Parameters<typeof ponder.on>[0]

for (const { chainSlug, launchpad } of enabledLaunchpads()) {
    if (!launchpad.feeCollector) continue
    const names = contractNames(launchpad.launchpadId, chainSlug)
    if (!('feeCollector' in names)) continue
    const bind = (event: string) => `${names.feeCollector}:${event}` as DynamicEvent

    ponder.on(bind('FeeShared'), (args) => handleFeeShared(args, launchpad.chainId))
    ponder.on(bind('Claimed'), (args) => handleClaimed(args, launchpad.chainId))
}

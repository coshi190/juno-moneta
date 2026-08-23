import type { PonderClient } from '../client.js'
import type { Deposit, Incentive } from '../entities.js'
import { sel, type Items, type Row } from './internal.js'

const INCENTIVE_FIELDS = [
    'incentiveId',
    'rewardToken',
    'pool',
    'startTime',
    'endTime',
    'refundee',
    'reward',
    'refunded',
    'endedAt',
] as const satisfies readonly (keyof Incentive)[]

export type IncentiveRow = Row<Incentive, typeof INCENTIVE_FIELDS>

export async function fetchIncentives(
    client: PonderClient,
    { chainId, limit = 200 }: { chainId: number; limit?: number }
): Promise<IncentiveRow[]> {
    const data = await client.request<{ incentives: Items<IncentiveRow> }>(
        `query Incentives($chainId: Int!, $limit: Int!) {
            incentives(where: { chainId: $chainId }, limit: $limit) {
                items { ${sel(INCENTIVE_FIELDS)} }
            }
        }`,
        { chainId, limit }
    )
    return data.incentives.items
}

const DEPOSIT_FIELDS = [
    'tokenId',
    'owner',
    'updatedAt',
] as const satisfies readonly (keyof Deposit)[]

export type DepositRow = Row<Deposit, typeof DEPOSIT_FIELDS>

export async function fetchDepositsByOwner(
    client: PonderClient,
    { chainId, owner, limit = 500 }: { chainId: number; owner: string; limit?: number }
): Promise<DepositRow[]> {
    const data = await client.request<{ deposits: Items<DepositRow> }>(
        `query DepositsByOwner($chainId: Int!, $owner: String!, $limit: Int!) {
            deposits(where: { chainId: $chainId, owner: $owner }, limit: $limit) {
                items { ${sel(DEPOSIT_FIELDS)} }
            }
        }`,
        { chainId, owner: owner.toLowerCase(), limit }
    )
    return data.deposits.items
}

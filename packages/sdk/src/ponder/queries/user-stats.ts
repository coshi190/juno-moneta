import type { PonderClient } from '../client.js'
import type { UserStat } from '../entities.js'
import { computePoints } from '../../rewards/points.js'
import { sel, MAX_LIMIT, type Page, type Row } from './internal.js'

const USER_STAT_FIELDS = [
    'user',
    'volumeNative',
    'junoVolumeNative',
    'externalVolumeNative',
    'volumeUsd',
    'tradeCount',
    'buyCount',
    'sellCount',
] as const satisfies readonly (keyof UserStat)[]

type UserStatFields = Row<UserStat, typeof USER_STAT_FIELDS>

export type UserStatRow = UserStatFields & {
    points: number
}

export async function fetchUserStats(
    client: PonderClient,
    { chainId, users }: { chainId: number; users: string[] }
): Promise<UserStatRow[]> {
    const rows = await client.fetchAllPages<{ userStats: Page<UserStatFields> }, UserStatFields>(
        `query UserStats($where: userStatFilter, $after: String) {
            userStats(
                where: $where
                orderBy: "volumeNative"
                orderDirection: "desc"
                limit: ${MAX_LIMIT}
                after: $after
            ) {
                pageInfo { hasNextPage endCursor }
                items { ${sel(USER_STAT_FIELDS)} }
            }
        }`,
        { where: { chainId, user_in: users } },
        (r) => r.userStats
    )
    return rows.map((row) => ({ ...row, points: computePoints(row) }))
}

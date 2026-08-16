import type { PonderClient } from '../client.js'
import type { UserStat } from '../entities.js'
import { sel, MAX_LIMIT, type Page, type Row } from './internal.js'

const USER_STAT_FIELDS = [
    'user',
    'volumeNative',
    'junoVolumeNative',
    'externalVolumeNative',
    'tradeCount',
    'buyCount',
    'sellCount',
] as const satisfies readonly (keyof UserStat)[]

export type UserStatRow = Row<UserStat, typeof USER_STAT_FIELDS>

export function fetchUserStats(
    client: PonderClient,
    { chainId, users }: { chainId: number; users: string[] }
): Promise<UserStatRow[]> {
    return client.fetchAllPages<{ userStats: Page<UserStatRow> }, UserStatRow>(
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
}

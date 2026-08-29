import { describe, it, expect, vi, afterEach } from 'vitest'
import { parse, type DocumentNode, type OperationDefinitionNode, type FieldNode } from 'graphql'
import type { PonderClient, PonderPageInfo } from '../ponder/client'
import {
    LAUNCH_TOKEN_DETAIL_FIELDS,
    LAUNCH_TOKEN_META_FIELDS,
    LAUNCH_TOKEN_CARD_FIELDS,
    TOKEN_SNAPSHOT_LIST_FIELDS,
    TOKEN_SNAPSHOT_CREATOR_FIELDS,
    TOKEN_HOLDER_ADDRESS_FIELDS,
    TOKEN_HOLDER_BALANCE_FIELDS,
    fetchLaunchTokens,
    fetchTokenSnapshots,
    fetchRecentSwaps,
    fetchTokenHolders,
} from '../ponder/queries/launchpad.js'
import {
    fetchBondingCurveSwaps,
    fetchV3Swaps,
    fetchV2Swaps,
    fetchUserBondingCurveSwaps,
    fetchUserTransfers,
    fetchUserAggSwaps,
    fetchTokenBondingCurveSwaps,
} from '../ponder/queries/swaps.js'
import {
    fetchNativeUsdPrice,
    fetchNativeUsdPriceSnapshots,
    fetchV3TokenSnapshots,
    fetchV3Pools,
    fetchV3Tokens,
    fetchV3PoolDayVolumes,
} from '../ponder/queries/pools.js'
import {
    fetchBondingCurveHistory,
    fetchV3History,
    fetchPoolPriceHistory,
    fetchPoolPriceAnchor,
} from '../ponder/queries/history.js'
import { fetchAllReferralBindings } from '../ponder/queries/referrals.js'
import { fetchIndexerStatus } from '../ponder/queries/status.js'

interface Captured {
    query: string
    variables?: Record<string, unknown>
}

function stubClient(response: unknown, captured: Captured[] = []): PonderClient {
    const client: PonderClient = {
        request: async <T>(query: string, variables?: Record<string, unknown>) => {
            captured.push({ query, variables })
            return response as T
        },
        fetchAllPages: async <TResponse, TItem>(
            query: string,
            variables: Record<string, unknown>,
            select: (r: TResponse) => { pageInfo: PonderPageInfo; items: TItem[] }
        ) => {
            captured.push({ query, variables: { ...variables, after: null } })
            return select(response as TResponse).items
        },
    }
    return client
}

function rootFields(doc: DocumentNode): string[] {
    const op = doc.definitions.find(
        (d): d is OperationDefinitionNode => d.kind === 'OperationDefinition'
    )!
    return op.selectionSet.selections
        .filter((s): s is FieldNode => s.kind === 'Field')
        .map((s) => s.name.value)
}

const page = <T>(items: T[]) => ({ items, pageInfo: { hasNextPage: false, endCursor: null } })

describe('every query is valid GraphQL and hits the expected root field', () => {
    it('launchpad', async () => {
        const cap: Captured[] = []
        const client = stubClient(
            {
                launchTokens: page([]),
                tokenSnapshots: page([]),
                swapEvents: page([]),
                nativeUsdPrices: page([]),
            },
            cap
        )

        await fetchLaunchTokens(client, { chainId: 96 }, LAUNCH_TOKEN_DETAIL_FIELDS)
        await fetchLaunchTokens(
            client,
            { chainId: 96, creator: '0xabc' },
            LAUNCH_TOKEN_DETAIL_FIELDS,
            { orderBy: 'createdTime', orderDirection: 'desc' }
        )
        await fetchLaunchTokens(client, { chainId: 96, isGraduated: 1 }, LAUNCH_TOKEN_META_FIELDS, {
            orderBy: 'graduatedAt',
            orderDirection: 'desc',
        })
        await fetchLaunchTokens(client, { chainId: 96, isGraduated: 0 }, LAUNCH_TOKEN_META_FIELDS)
        await fetchLaunchTokens(client, { tokenAddrs: ['0xtok'] }, LAUNCH_TOKEN_CARD_FIELDS)
        await fetchTokenSnapshots(client, { chainId: 96 }, TOKEN_SNAPSHOT_LIST_FIELDS)
        await fetchTokenSnapshots(
            client,
            { chainId: 96, tokenAddrs: ['0xtok'] },
            TOKEN_SNAPSHOT_CREATOR_FIELDS
        )
        await fetchRecentSwaps(client, { chainId: 96 })

        for (const c of cap) expect(() => parse(c.query)).not.toThrow()

        for (const i of [0, 1, 2, 3, 4]) {
            expect(rootFields(parse(cap[i]!.query))).toEqual(['launchTokens'])
        }
        for (const i of [5, 6]) {
            expect(rootFields(parse(cap[i]!.query))).toEqual(['tokenSnapshots'])
        }
        expect(rootFields(parse(cap[7]!.query))).toEqual(['swapEvents', 'launchTokens'])
        expect(cap[1]!.variables!.where).toEqual({ chainId: 96, creator: '0xabc' })
    })

    it('prices, pools and holders', async () => {
        const cap: Captured[] = []
        const client = stubClient(
            {
                nativeUsdPrices: page([{ chainId: 96, price: '1.25' }]),
                nativeUsdPriceSnapshots: page([]),
                v3TokenSnapshots: page([]),
                tokenSnapshots: page([]),
                v3Pools: page([]),
                v3Tokens: page([]),
                v3PoolDayVolumes: page([]),
                tokenHolders: page([]),
            },
            cap
        )

        expect(await fetchNativeUsdPrice(client, { chainId: 96 })).toBe(1.25)
        await fetchNativeUsdPriceSnapshots(client, { chainId: 96 })
        await fetchV3TokenSnapshots(client, { chainId: 96 })
        await fetchV3Pools(client, { chainId: 96 })
        await fetchV3Tokens(client, { chainId: 96 })
        await fetchTokenHolders(client, { tokenAddr: '0xtok' }, TOKEN_HOLDER_ADDRESS_FIELDS)
        await fetchTokenHolders(client, { address: '0xme' }, TOKEN_HOLDER_BALANCE_FIELDS)
        await fetchTokenHolders(client, { chainId: 96 }, TOKEN_HOLDER_ADDRESS_FIELDS)

        for (const c of cap) expect(() => parse(c.query)).not.toThrow()
        for (const i of [5, 6, 7]) {
            expect(rootFields(parse(cap[i]!.query))).toEqual(['tokenHolders'])
        }
    })

    it('swaps and history', async () => {
        const cap: Captured[] = []
        const client = stubClient(
            {
                swapEvents: { ...page([]), totalCount: 0 },
                v3SwapEvents: { ...page([]), totalCount: 0 },
                v2SwapEvents: page([]),
                aggSwapEvents: page([]),
                transferEvents: page([]),
                referralBindings: page([]),
            },
            cap
        )

        await fetchBondingCurveSwaps(client, { chainId: 96 })
        await fetchV3Swaps(client, { chainId: 96 })
        await fetchV2Swaps(client, { chainId: 96 })
        await fetchUserBondingCurveSwaps(client, { chainId: 96, sender: '0xme', limit: 20 })
        await fetchUserTransfers(client, { chainId: 96, sender: '0xme', limit: 20 })
        await fetchUserAggSwaps(client, { chainId: 96, sender: '0xme', limit: 20 })
        await fetchBondingCurveHistory(client, { tokenAddr: '0xtok' })
        await fetchV3History(client, { tokenAddr: '0xtok', chainId: 96 })
        await fetchPoolPriceHistory(client, { poolAddress: '0xp', chainId: 96, since: 1 })
        await fetchPoolPriceAnchor(client, { poolAddress: '0xp', chainId: 96, before: 1 })
        await fetchAllReferralBindings(client)

        for (const c of cap) expect(() => parse(c.query)).not.toThrow()
    })
})

describe('filters travel as GraphQL variables, never interpolated into the query', () => {
    it('maps the bonding curve scan onto `sender`, and the DEX scans onto `txFrom`', async () => {
        const cap: Captured[] = []
        const client = stubClient({ swapEvents: page([]), v3SwapEvents: page([]) }, cap)

        await fetchBondingCurveSwaps(client, { chainId: 96, sender: '0xme', since: 100 })
        await fetchV3Swaps(client, { chainId: 96, senders: ['0xa', '0xb'] })

        expect(cap[0]!.variables!.where).toEqual({
            chainId: 96,
            sender: '0xme',
            timestamp_gte: 100,
        })
        expect(cap[1]!.variables!.where).toEqual({ chainId: 96, txFrom_in: ['0xa', '0xb'] })
        expect(cap[1]!.query).not.toContain('0xa')
    })

    it('omits absent filters entirely rather than sending nulls', async () => {
        const cap: Captured[] = []
        const client = stubClient({ swapEvents: page([]) }, cap)
        await fetchBondingCurveSwaps(client, { chainId: 96 })
        expect(cap[0]!.variables!.where).toEqual({ chainId: 96 })
    })

    it('filters graduated tokens server-side', async () => {
        const cap: Captured[] = []
        const client = stubClient({ launchTokens: page([]) }, cap)
        await fetchLaunchTokens(client, { chainId: 96, isGraduated: 1 }, LAUNCH_TOKEN_META_FIELDS)
        expect(cap[0]!.variables!.where).toEqual({ chainId: 96, isGraduated: 1 })
        expect(cap[0]!.query).not.toContain('96')
    })

    it('lowercases creator and token addresses so checksummed input still matches', async () => {
        const cap: Captured[] = []
        const client = stubClient({ launchTokens: page([]), tokenSnapshots: page([]) }, cap)

        await fetchLaunchTokens(
            client,
            { chainId: 96, creator: '0xAbCdEf', tokenAddrs: ['0xToK'] },
            LAUNCH_TOKEN_META_FIELDS
        )
        await fetchTokenSnapshots(client, { tokenAddrs: ['0xToK'] }, TOKEN_SNAPSHOT_LIST_FIELDS)

        expect(cap[0]!.variables!.where).toEqual({
            chainId: 96,
            creator: '0xabcdef',
            tokenAddr_in: ['0xtok'],
        })
        expect(cap[1]!.variables!.where).toEqual({ tokenAddr_in: ['0xtok'] })
    })

    it('omits ordering arguments when no order is requested', async () => {
        const cap: Captured[] = []
        const client = stubClient({ launchTokens: page([]) }, cap)

        await fetchLaunchTokens(client, { chainId: 96 }, LAUNCH_TOKEN_META_FIELDS)
        expect(cap[0]!.query).not.toContain('orderBy')

        await fetchLaunchTokens(client, { chainId: 96 }, LAUNCH_TOKEN_META_FIELDS, {
            orderBy: 'createdTime',
            orderDirection: 'desc',
        })
        expect(cap[1]!.query).toContain('orderBy: "createdTime"')
        expect(cap[1]!.query).toContain('orderDirection: "desc"')
    })

    it('paginates the launch token and snapshot lists', async () => {
        const cap: Captured[] = []
        const client = stubClient({ launchTokens: page([]), tokenSnapshots: page([]) }, cap)

        await fetchLaunchTokens(client, { chainId: 96 }, LAUNCH_TOKEN_META_FIELDS)
        await fetchTokenSnapshots(client, { chainId: 96 }, TOKEN_SNAPSHOT_LIST_FIELDS)

        for (const c of cap) {
            expect(c.query).toContain('$after: String')
            expect(c.query).toContain('pageInfo { hasNextPage endCursor }')
            expect(c.variables).toMatchObject({ after: null })
        }
    })

    it('builds the token trade feed filter from the optional args', async () => {
        const cap: Captured[] = []
        const client = stubClient({ swapEvents: { ...page([]), totalCount: 0 } }, cap)

        await fetchTokenBondingCurveSwaps(client, { tokenAddr: '0xtok', limit: 20, offset: 0 })
        await fetchTokenBondingCurveSwaps(client, {
            tokenAddr: '0xtok',
            limit: 20,
            offset: 40,
            isBuy: 1,
            sender: '0xme',
        })

        expect(cap[0]!.variables!.where).toEqual({ tokenAddr: '0xtok' })
        expect(cap[1]!.variables!.where).toEqual({ tokenAddr: '0xtok', isBuy: 1, sender: '0xme' })
        expect(cap[1]!.variables).toMatchObject({ offset: 40 })
    })
})

describe('fetchV3Pools', () => {
    it('declares cursor pagination so the pool list is never truncated', async () => {
        const cap: Captured[] = []
        await fetchV3Pools(stubClient({ v3Pools: page([]) }, cap), { chainId: 96 })

        expect(cap).toHaveLength(1)
        expect(cap[0]!.query).toContain('$after: String')
        expect(cap[0]!.query).toContain('pageInfo { hasNextPage endCursor }')
        expect(cap[0]!.variables).toMatchObject({ chainId: 96, protocol: 'junoswap', after: null })
    })
})

describe('empty address lists short-circuit instead of querying', () => {
    it.each([
        [
            'fetchTokenSnapshots',
            () =>
                fetchTokenSnapshots(stubClient({}), { chainId: 96, tokenAddrs: [] }, ['tokenAddr']),
        ],
        [
            'fetchLaunchTokens',
            () => fetchLaunchTokens(stubClient({}), { tokenAddrs: [] }, ['tokenAddr']),
        ],
        [
            'fetchV3PoolDayVolumes',
            () =>
                fetchV3PoolDayVolumes(stubClient({}), {
                    chainId: 96,
                    poolAddresses: [],
                    since: 0,
                }),
        ],
    ])('%s', async (_name, run) => {
        await expect(run()).resolves.toEqual([])
    })

    it('issues no request at all for an empty address list', async () => {
        const cap: Captured[] = []
        const client = stubClient({ launchTokens: page([]), tokenSnapshots: page([]) }, cap)

        await fetchLaunchTokens(client, { chainId: 96, tokenAddrs: [] }, ['tokenAddr'])
        await fetchTokenSnapshots(client, { chainId: 96, tokenAddrs: [] }, ['tokenAddr'])

        expect(cap).toHaveLength(0)
    })
})

describe('fetchIndexerStatus', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('reads `_meta` and derives the lag from the indexed block timestamp', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_755_561_234_000)

        const cap: Captured[] = []
        const client = stubClient(
            {
                _meta: {
                    status: {
                        bitkub: { id: 96, block: { number: 26104233, timestamp: 1755561220 } },
                        jbc: { id: 8899, block: { number: 3100000, timestamp: 1755560234 } },
                    },
                },
            },
            cap
        )

        const status = await fetchIndexerStatus(client)

        expect(() => parse(cap[0]!.query)).not.toThrow()
        expect(rootFields(parse(cap[0]!.query))).toEqual(['_meta'])
        expect(status).toEqual({
            bitkub: {
                id: 96,
                block: { number: 26104233, timestamp: 1755561220 },
                lagSeconds: 14,
            },
            jbc: {
                id: 8899,
                block: { number: 3100000, timestamp: 1755560234 },
                lagSeconds: 1000,
            },
        })
    })

    it('never reports a negative lag when the indexed block is ahead of the clock', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_755_561_000_000)

        const status = await fetchIndexerStatus(
            stubClient({
                _meta: {
                    status: { bitkub: { id: 96, block: { number: 1, timestamp: 1755561220 } } },
                },
            })
        )

        expect(status.bitkub!.lagSeconds).toBe(0)
    })

    it('returns an empty status before any checkpoint exists', async () => {
        await expect(fetchIndexerStatus(stubClient({ _meta: null }))).resolves.toEqual({})
        await expect(fetchIndexerStatus(stubClient({ _meta: { status: null } }))).resolves.toEqual(
            {}
        )
        await expect(
            fetchIndexerStatus(
                stubClient({ _meta: { status: { bitkub: { id: 96, block: null } } } })
            )
        ).resolves.toEqual({})
    })
})

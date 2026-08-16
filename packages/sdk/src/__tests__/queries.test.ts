import { describe, it, expect } from 'vitest'
import { parse, type DocumentNode, type OperationDefinitionNode, type FieldNode } from 'graphql'
import type { PonderClient, PonderPageInfo } from '../ponder/client'
import * as q from '../ponder/queries'

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

        await q.fetchTokenList(client, { chainId: 96 })
        await q.fetchCreatedTokens(client, { chainId: 96, creator: '0xabc' })
        await q.fetchGraduatedTokens(client, { chainId: 96 })
        await q.fetchBondingCurveTokens(client, { chainId: 96 })
        await q.fetchLaunchTokenMeta(client, { chainId: 96 })
        await q.fetchRecentSwaps(client, { chainId: 96 })
        await q.fetchLaunchTokenOg(client, { tokenAddr: '0xtok' })

        for (const c of cap) expect(() => parse(c.query)).not.toThrow()

        expect(rootFields(parse(cap[0]!.query))).toEqual(['launchTokens', 'tokenSnapshots'])
        expect(rootFields(parse(cap[5]!.query))).toEqual(['swapEvents', 'launchTokens'])
        expect(cap[1]!.variables).toMatchObject({ chainId: 96, creator: '0xabc' })
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

        expect(await q.fetchNativeUsdPrice(client, { chainId: 96 })).toBe(1.25)
        await q.fetchNativeUsdPriceSnapshots(client, { chainId: 96 })
        await q.fetchV3TokenSnapshots(client, { chainId: 96 })
        await q.fetchV3Pools(client, { chainId: 96 })
        await q.fetchV3Tokens(client, { chainId: 96 })
        await q.fetchTokenHolders(client, { tokenAddr: '0xtok' })
        await q.fetchHolderBalances(client, { address: '0xme' })
        await q.fetchAllTokenHolders(client)

        for (const c of cap) expect(() => parse(c.query)).not.toThrow()
        expect(rootFields(parse(cap[5]!.query))).toEqual(['tokenHolders', 'tokenSnapshots'])
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

        await q.fetchBondingCurveSwaps(client, { chainId: 96 })
        await q.fetchV3Swaps(client, { chainId: 96 })
        await q.fetchV2Swaps(client, { chainId: 96 })
        await q.fetchUserBondingCurveSwaps(client, { chainId: 96, sender: '0xme', limit: 20 })
        await q.fetchUserTransfers(client, { chainId: 96, sender: '0xme', limit: 20 })
        await q.fetchUserAggSwaps(client, { chainId: 96, sender: '0xme', limit: 20 })
        await q.fetchBondingCurveHistory(client, { tokenAddr: '0xtok' })
        await q.fetchV3History(client, { tokenAddr: '0xtok', chainId: 96 })
        await q.fetchPoolPriceHistory(client, { poolAddress: '0xp', chainId: 96, since: 1 })
        await q.fetchPoolPriceAnchor(client, { poolAddress: '0xp', chainId: 96, before: 1 })
        await q.fetchAllReferralBindings(client)

        for (const c of cap) expect(() => parse(c.query)).not.toThrow()
    })
})

describe('filters travel as GraphQL variables, never interpolated into the query', () => {
    it('maps the bonding curve scan onto `sender`, and the DEX scans onto `txFrom`', async () => {
        const cap: Captured[] = []
        const client = stubClient({ swapEvents: page([]), v3SwapEvents: page([]) }, cap)

        await q.fetchBondingCurveSwaps(client, { chainId: 96, sender: '0xme', since: 100 })
        await q.fetchV3Swaps(client, { chainId: 96, senders: ['0xa', '0xb'] })

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
        await q.fetchBondingCurveSwaps(client, { chainId: 96 })
        expect(cap[0]!.variables!.where).toEqual({ chainId: 96 })
    })

    it('filters graduated tokens server-side', async () => {
        const cap: Captured[] = []
        const client = stubClient({ launchTokens: page([]) }, cap)
        await q.fetchGraduatedTokens(client, { chainId: 96 })
        expect(cap[0]!.query).toContain('isGraduated: 1')
    })

    it('builds the token trade feed filter from the optional args', async () => {
        const cap: Captured[] = []
        const client = stubClient({ swapEvents: { ...page([]), totalCount: 0 } }, cap)

        await q.fetchTokenBondingCurveSwaps(client, { tokenAddr: '0xtok', limit: 20, offset: 0 })
        await q.fetchTokenBondingCurveSwaps(client, {
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

describe('fetchGraduatedPool', () => {
    it('retries with the token order reversed before giving up', async () => {
        const cap: Captured[] = []
        let call = 0
        const client: PonderClient = {
            request: async <T>(query: string, variables?: Record<string, unknown>) => {
                cap.push({ query, variables })
                const hit = variables!.token0 === '0xwnative'
                return { v3Pools: { items: hit ? [{ address: '0xpool' }] : [] } } as T
            },
            fetchAllPages: async () => [],
        }
        void call

        const address = await q.fetchGraduatedPool(client, {
            tokenAddr: '0xtok',
            wrappedNative: '0xwnative',
        })

        expect(address).toBe('0xpool')
        expect(cap).toHaveLength(2)
        expect(cap[0]!.variables).toMatchObject({ token0: '0xtok', token1: '0xwnative' })
        expect(cap[1]!.variables).toMatchObject({ token0: '0xwnative', token1: '0xtok' })
    })

    it('returns null when neither orientation exists', async () => {
        const client = stubClient({ v3Pools: { items: [] } })
        expect(
            await q.fetchGraduatedPool(client, { tokenAddr: '0xtok', wrappedNative: '0xwn' })
        ).toBeNull()
    })
})

describe('empty address lists short-circuit instead of querying', () => {
    it.each([
        [
            'fetchCreatorSnapshots',
            () => q.fetchCreatorSnapshots(stubClient({}), { chainId: 96, tokenAddrs: [] }),
        ],
        [
            'fetchTokenSnapshotsByAddresses',
            () => q.fetchTokenSnapshotsByAddresses(stubClient({}), { tokenAddrs: [] }),
        ],
        [
            'fetchLaunchTokensByAddresses',
            () => q.fetchLaunchTokensByAddresses(stubClient({}), { tokenAddrs: [] }),
        ],
        [
            'fetchV3PoolDayVolumes',
            () =>
                q.fetchV3PoolDayVolumes(stubClient({}), {
                    chainId: 96,
                    poolAddresses: [],
                    since: 0,
                }),
        ],
    ])('%s', async (_name, run) => {
        await expect(run()).resolves.toEqual([])
    })
})

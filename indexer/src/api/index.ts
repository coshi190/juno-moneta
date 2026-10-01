import { db } from 'ponder:api'
import schema from 'ponder:schema'
import { graphql, eq, and, gte, inArray, type AnyPgColumn } from 'ponder'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { computePnl, computePoints } from '@coshi190/juno-moneta-sdk'
import { getWrappedNativeAddress } from '../config.js'
import {
    countsTowardStats,
    parseBondingCurveSwap,
    parseV2Swap,
    parseV3Swap,
    type ParsedSwap,
} from '../parse-swaps.js'
import { computeWindowedTraderStats } from '../trader-stats.js'
import {
    makePriceAt,
    computePriceFromSqrtPriceX96,
    sanitizePricePoints,
    parseTokenUsdPrice,
    type PricePoint,
} from '../price-history.js'

const app = new Hono()

app.use('*', cors())

const gql = graphql({ db, schema })
app.use('/', gql)
app.use('/graphql', gql)

async function priceMapForTokens(
    chainId: number,
    tokenAddrs: string[]
): Promise<Map<string, number | null>> {
    const prices = new Map<string, number | null>()
    if (tokenAddrs.length === 0) return prices

    const v3Ids = tokenAddrs.map((t) => `${chainId}-${t}`)
    const [v3Snaps, bcSnaps] = await Promise.all([
        db.select().from(schema.v3TokenSnapshot).where(inArray(schema.v3TokenSnapshot.id, v3Ids)),
        db
            .select()
            .from(schema.tokenSnapshot)
            .where(inArray(schema.tokenSnapshot.tokenAddr, tokenAddrs)),
    ])

    for (const s of bcSnaps) prices.set(s.tokenAddr, parseTokenUsdPrice(s.lastPriceUsd))
    for (const s of v3Snaps) {
        const p = parseTokenUsdPrice(s.lastPriceUsd)
        if (p !== null) prices.set(s.tokenAddr, p)
    }
    return prices
}

async function nativeUsdPoints(chainId: number, since: number): Promise<PricePoint[]> {
    const rows = await db
        .select()
        .from(schema.nativeUsdPriceSnapshot)
        .where(
            and(
                eq(schema.nativeUsdPriceSnapshot.chainId, chainId),
                gte(schema.nativeUsdPriceSnapshot.timestamp, since)
            )
        )
    return sanitizePricePoints(
        rows.map((s) => ({ timestamp: s.timestamp, price: parseFloat(s.price) }))
    )
}

async function loadSwaps(
    chainId: number,
    filter: { user: string } | { since: number },
    statsOnly = false
): Promise<ParsedSwap[]> {
    const where = (t: { chainId: AnyPgColumn; timestamp: AnyPgColumn }, userCol: AnyPgColumn) =>
        and(
            eq(t.chainId, chainId),
            'user' in filter ? eq(userCol, filter.user) : gte(t.timestamp, filter.since)
        )
    const wn = getWrappedNativeAddress(chainId)
    const { swapEvent: bc, v2SwapEvent: v2, v3SwapEvent: v3 } = schema

    const [bcRows, v2Rows, v3Rows] = await Promise.all([
        db.select().from(bc).where(where(bc, bc.sender)),
        wn ? db.select().from(v2).where(where(v2, v2.txFrom)) : [],
        wn ? db.select().from(v3).where(where(v3, v3.txFrom)) : [],
    ])

    const bcCounted = statsOnly
        ? bcRows.filter((r) => countsTowardStats(r.launchpadId, r.viaFrontend === 1))
        : bcRows
    const v3Counted = statsOnly
        ? v3Rows.filter((r) => countsTowardStats(r.protocol, r.viaFrontend === 1))
        : v3Rows
    const dex = wn
        ? [...v2Rows.map((r) => parseV2Swap(r, wn)), ...v3Counted.map((r) => parseV3Swap(r, wn))]
        : []
    return [...bcCounted.map(parseBondingCurveSwap), ...dex.filter((p) => p !== null)]
}

app.get('/user-pnl', async (c) => {
    const chainId = Number(c.req.query('chainId'))
    const user = c.req.query('user')?.toLowerCase()
    if (!Number.isInteger(chainId) || !user) {
        return c.json({ error: 'chainId and user are required' }, 400)
    }

    const rows = await db
        .select()
        .from(schema.userTokenPnl)
        .where(and(eq(schema.userTokenPnl.chainId, chainId), eq(schema.userTokenPnl.user, user)))

    const prices = await priceMapForTokens(
        chainId,
        rows.map((r) => r.tokenAddr)
    )
    const folds = new Map(rows.map((r) => [r.tokenAddr, r]))
    const { perToken, totals } = computePnl({ folds, priceUsdByToken: prices })

    return c.json({ perToken: Object.fromEntries(perToken), totals })
})

app.get('/user-swaps', async (c) => {
    const chainId = Number(c.req.query('chainId'))
    const user = c.req.query('user')?.toLowerCase()
    if (!Number.isInteger(chainId) || !user) {
        return c.json({ error: 'chainId and user are required' }, 400)
    }

    const swaps = await loadSwaps(chainId, { user })
    swaps.sort((a, b) => a.timestamp - b.timestamp)

    return c.json({ swaps })
})

const PERIOD_SECONDS: Record<string, number> = { '24h': 86400, '7d': 604800, '30d': 2592000 }

async function windowedLeaderboardTraders(chainId: number, since: number) {
    const events = await loadSwaps(chainId, { since }, true)
    if (events.length === 0) return []

    const tokenAddrs = [...new Set(events.map((e) => e.tokenAddr))]
    const [[currentNative], points, tokenRows, prices] = await Promise.all([
        db
            .select()
            .from(schema.nativeUsdPrice)
            .where(eq(schema.nativeUsdPrice.chainId, chainId))
            .limit(1),
        nativeUsdPoints(chainId, since),
        db
            .select()
            .from(schema.v3Token)
            .where(
                inArray(
                    schema.v3Token.id,
                    tokenAddrs.map((t) => `${chainId}-${t}`)
                )
            ),
        priceMapForTokens(chainId, tokenAddrs),
    ])
    const priceAt = makePriceAt(points, currentNative ? parseFloat(currentNative.price) : 0)
    const decimalsByToken = new Map(tokenRows.map((t) => [t.address, t.decimals ?? 18]))

    const statsByAddr = computeWindowedTraderStats(events, priceAt, prices, decimalsByToken)
    return [...statsByAddr].map(([address, s]) => ({ address, ...s }))
}

function withReferredPoints<T extends { address: string; points: number }>(
    traders: T[],
    bindings: { referrer: string; referee: string }[]
): Array<T & { referredPoints: number }> {
    const pointsByUser = new Map(traders.map((t) => [t.address, t.points]))
    const byReferrer = new Map<string, number[]>()
    for (const b of bindings) {
        const list = byReferrer.get(b.referrer) ?? []
        list.push(pointsByUser.get(b.referee) ?? 0)
        byReferrer.set(b.referrer, list)
    }

    return traders.map((t) => ({
        ...t,
        referredPoints: computePoints(byReferrer.get(t.address) ?? []),
    }))
}

app.get('/leaderboard', async (c) => {
    const chainId = Number(c.req.query('chainId'))
    if (!Number.isInteger(chainId)) {
        return c.json({ error: 'chainId is required' }, 400)
    }

    const bindingsQuery = db
        .select()
        .from(schema.referralBinding)
        .where(eq(schema.referralBinding.chainId, chainId))

    const windowSeconds = PERIOD_SECONDS[c.req.query('period') ?? '']
    if (windowSeconds) {
        const since = Math.floor(Date.now() / 1000) - windowSeconds
        const [windowed, bindings] = await Promise.all([
            windowedLeaderboardTraders(chainId, since),
            bindingsQuery,
        ])
        return c.json({ traders: withReferredPoints(windowed, bindings) })
    }

    const [pnlRows, statRows, bindings] = await Promise.all([
        db.select().from(schema.userTokenPnl).where(eq(schema.userTokenPnl.chainId, chainId)),
        db.select().from(schema.userStat).where(eq(schema.userStat.chainId, chainId)),
        bindingsQuery,
    ])

    const prices = await priceMapForTokens(chainId, [...new Set(pnlRows.map((r) => r.tokenAddr))])

    const foldsByUser = new Map<string, Map<string, (typeof pnlRows)[number]>>()
    for (const r of pnlRows) {
        foldsByUser.set(r.user, (foldsByUser.get(r.user) ?? new Map()).set(r.tokenAddr, r))
    }

    const traders = statRows.map((s) => {
        const folds = foldsByUser.get(s.user)
        const totals = folds && computePnl({ folds, priceUsdByToken: prices }).totals
        return {
            address: s.user,
            pnlUsd: totals?.totalPnlUsd ?? 0,
            pnlPercent: totals?.totalPnlPercent ?? 0,
            volumeNative: s.volumeNative,
            junoVolumeNative: s.junoVolumeNative,
            externalVolumeNative: s.externalVolumeNative,
            volumeUsd: s.volumeUsd,
            points: computePoints(s),
            tradeCount: s.tradeCount,
            buyCount: s.buyCount,
            sellCount: s.sellCount,
        }
    })

    return c.json({ traders: withReferredPoints(traders, bindings) })
})

app.get('/native-usd-price-history', async (c) => {
    const chainId = Number(c.req.query('chainId'))
    if (!Number.isInteger(chainId)) {
        return c.json({ error: 'chainId is required' }, 400)
    }

    const sinceRaw = c.req.query('since')
    const since = sinceRaw === undefined ? 0 : Number(sinceRaw)
    if (!Number.isInteger(since) || since < 0) {
        return c.json({ error: 'since must be a unix timestamp' }, 400)
    }

    return c.json({ points: await nativeUsdPoints(chainId, since) })
})

app.get('/token-price-history', async (c) => {
    const chainId = Number(c.req.query('chainId'))
    const tokenAddr = c.req.query('tokenAddr')?.toLowerCase()
    const since = Number(c.req.query('since'))
    const source = c.req.query('source')
    if (!Number.isInteger(chainId) || !tokenAddr || !Number.isInteger(since) || since < 0) {
        return c.json({ error: 'chainId, tokenAddr and since are required' }, 400)
    }
    if (source !== 'bc' && source !== 'v3') {
        return c.json({ error: 'source must be bc or v3' }, 400)
    }

    const { swapEvent: bc, v3SwapEvent: v3 } = schema
    const match = (t: { chainId: AnyPgColumn; tokenAddr: AnyPgColumn; timestamp: AnyPgColumn }) =>
        and(eq(t.chainId, chainId), eq(t.tokenAddr, tokenAddr), gte(t.timestamp, since))
    const raw: PricePoint[] =
        source === 'bc'
            ? (await db.select().from(bc).where(match(bc))).map((r) => ({
                  timestamp: r.timestamp,
                  price: parseFloat(r.priceNative),
              }))
            : (await db.select().from(v3).where(match(v3))).map((r) => ({
                  timestamp: r.timestamp,
                  price: computePriceFromSqrtPriceX96(
                      BigInt(r.sqrtPriceX96),
                      r.tokenIsToken0 === 1,
                      18,
                      18
                  ),
              }))

    return c.json({ points: sanitizePricePoints(raw) })
})

export default app

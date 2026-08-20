import { db } from 'ponder:api'
import schema from 'ponder:schema'
import { graphql, eq, and, gte, inArray } from 'ponder'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
    computeReferralPoints,
    userStatPoints,
    parseV2Swap,
    parseV3Swap,
    calculatePrice,
    calculatePriceFromSqrtPrice,
    WRAPPED_NATIVE_ADDRESSES,
    type TokenPnl,
} from '@coshi190/junoswap-sdk'
import { finalizeTokenPnl, finalizePortfolioPnl, type PnlFold } from '../pnl-math.js'
import { computeWindowedTraderStats, type LeaderboardSwapEvent } from '../trader-stats.js'
import {
    makePriceAt,
    sanitizePricePoints,
    sanitizeUsdPrice,
    MAX_TOKEN_USD_PRICE,
    type NativePricePoint,
} from '../price-history.js'

const app = new Hono()

app.use('*', cors())

app.use('/', graphql({ db, schema }))
app.use('/graphql', graphql({ db, schema }))

function toPrice(raw: string | null | undefined): number | null {
    if (!raw) return null
    return sanitizeUsdPrice(parseFloat(raw), MAX_TOKEN_USD_PRICE)
}

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

    for (const s of bcSnaps) prices.set(s.tokenAddr, toPrice(s.lastPriceUsd))
    for (const s of v3Snaps) {
        const p = toPrice(s.lastPriceUsd)
        if (p !== null) prices.set(s.tokenAddr, p)
    }
    return prices
}

async function nativeUsdPoints(chainId: number, since: number): Promise<NativePricePoint[]> {
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
    ).sort((a, b) => a.timestamp - b.timestamp)
}

function foldOf(row: {
    position: number
    costPoolUsd: number
    realizedUsd: number
    totalInvestedUsd: number
}): PnlFold {
    return {
        position: row.position,
        costPoolUsd: row.costPoolUsd,
        realizedUsd: row.realizedUsd,
        totalInvestedUsd: row.totalInvestedUsd,
    }
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

    const folds = new Map<string, PnlFold>()
    const balances = new Map<string, number>()
    for (const r of rows) {
        folds.set(r.tokenAddr, foldOf(r))
        balances.set(r.tokenAddr, r.position)
    }

    const { perToken, totals } = finalizePortfolioPnl(folds, balances, prices)
    const perTokenObj: Record<string, TokenPnl> = {}
    for (const [tokenAddr, pnl] of perToken) perTokenObj[tokenAddr] = pnl

    return c.json({ perToken: perTokenObj, totals })
})

const PERIOD_SECONDS: Record<string, number> = { '24h': 86400, '7d': 604800, '30d': 2592000 }

async function windowedLeaderboardTraders(chainId: number, since: number) {
    const wn = WRAPPED_NATIVE_ADDRESSES[chainId]?.toLowerCase() ?? null

    const [bcRows, v2Rows, v3Rows] = await Promise.all([
        db
            .select()
            .from(schema.swapEvent)
            .where(
                and(eq(schema.swapEvent.chainId, chainId), gte(schema.swapEvent.timestamp, since))
            ),
        db
            .select()
            .from(schema.v2SwapEvent)
            .where(
                and(
                    eq(schema.v2SwapEvent.chainId, chainId),
                    gte(schema.v2SwapEvent.timestamp, since)
                )
            ),
        db
            .select()
            .from(schema.v3SwapEvent)
            .where(
                and(
                    eq(schema.v3SwapEvent.chainId, chainId),
                    gte(schema.v3SwapEvent.timestamp, since)
                )
            ),
    ])

    const events: LeaderboardSwapEvent[] = []
    for (const r of bcRows) {
        events.push({
            tokenAddr: r.tokenAddr,
            sender: r.sender,
            isBuy: r.isBuy === 1,
            amountIn: r.amountIn,
            amountOut: r.amountOut,
            timestamp: r.timestamp,
            protocol: 'junoswap',
        })
    }
    if (wn) {
        for (const r of v2Rows) {
            const p = parseV2Swap(r, wn)
            if (p) {
                events.push({
                    tokenAddr: p.tokenAddr,
                    sender: p.sender,
                    isBuy: p.isBuy,
                    amountIn: p.amountIn,
                    amountOut: p.amountOut,
                    timestamp: p.timestamp,
                    protocol: p.protocol,
                })
            }
        }
        for (const r of v3Rows) {
            const p = parseV3Swap(r, wn)
            if (p) {
                events.push({
                    tokenAddr: p.tokenAddr,
                    sender: p.sender,
                    isBuy: p.isBuy,
                    amountIn: p.amountIn,
                    amountOut: p.amountOut,
                    timestamp: p.timestamp,
                    protocol: p.protocol,
                })
            }
        }
    }
    if (events.length === 0) return []

    const [currentNative] = await db
        .select()
        .from(schema.nativeUsdPrice)
        .where(eq(schema.nativeUsdPrice.chainId, chainId))
        .limit(1)
    const points = await nativeUsdPoints(chainId, since)
    const priceAt = makePriceAt(points, currentNative ? parseFloat(currentNative.price) : 0)

    const tokenAddrs = [...new Set(events.map((e) => e.tokenAddr))]
    const tokenRows = await db
        .select()
        .from(schema.v3Token)
        .where(
            inArray(
                schema.v3Token.id,
                tokenAddrs.map((t) => `${chainId}-${t}`)
            )
        )
    const decimalsByToken = new Map<string, number>()
    for (const t of tokenRows) decimalsByToken.set(t.address, t.decimals ?? 18)

    const prices = await priceMapForTokens(chainId, tokenAddrs)

    const statsByAddr = computeWindowedTraderStats(events, priceAt, prices, decimalsByToken)
    return [...statsByAddr].map(([address, s]) => ({ address, ...s }))
}

async function withReferredPoints<T extends { address: string; points: number }>(
    chainId: number,
    traders: T[]
): Promise<Array<T & { referredPoints: number }>> {
    const bindings = await db
        .select()
        .from(schema.referralBinding)
        .where(eq(schema.referralBinding.chainId, chainId))

    const pointsByUser = new Map(traders.map((t) => [t.address.toLowerCase(), t.points]))
    const byReferrer = new Map<string, number[]>()
    for (const b of bindings) {
        const list = byReferrer.get(b.referrer) ?? []
        list.push(pointsByUser.get(b.referee) ?? 0)
        byReferrer.set(b.referrer, list)
    }

    return traders.map((t) => ({
        ...t,
        referredPoints: computeReferralPoints(byReferrer.get(t.address.toLowerCase()) ?? []),
    }))
}

app.get('/leaderboard', async (c) => {
    const chainId = Number(c.req.query('chainId'))
    if (!Number.isInteger(chainId)) {
        return c.json({ error: 'chainId is required' }, 400)
    }

    const windowSeconds = PERIOD_SECONDS[c.req.query('period') ?? '']
    if (windowSeconds) {
        const since = Math.floor(Date.now() / 1000) - windowSeconds
        const windowed = await windowedLeaderboardTraders(chainId, since)
        return c.json({ traders: await withReferredPoints(chainId, windowed) })
    }

    const [pnlRows, statRows] = await Promise.all([
        db.select().from(schema.userTokenPnl).where(eq(schema.userTokenPnl.chainId, chainId)),
        db.select().from(schema.userStat).where(eq(schema.userStat.chainId, chainId)),
    ])

    const prices = await priceMapForTokens(chainId, [...new Set(pnlRows.map((r) => r.tokenAddr))])

    const pnlByUser = new Map<string, { pnlUsd: number; investedUsd: number }>()
    for (const r of pnlRows) {
        const price = prices.get(r.tokenAddr) ?? null
        const tp = finalizeTokenPnl(foldOf(r), r.position, price)
        const agg = pnlByUser.get(r.user) ?? { pnlUsd: 0, investedUsd: 0 }
        agg.pnlUsd += tp.totalPnlUsd
        agg.investedUsd += tp.totalInvestedUsd
        pnlByUser.set(r.user, agg)
    }

    const traders = statRows.map((s) => {
        const agg = pnlByUser.get(s.user) ?? { pnlUsd: 0, investedUsd: 0 }
        return {
            address: s.user,
            pnlUsd: agg.pnlUsd,
            pnlPercent: agg.investedUsd > 0 ? (agg.pnlUsd / agg.investedUsd) * 100 : 0,
            volumeNative: s.volumeNative,
            junoVolumeNative: s.junoVolumeNative,
            externalVolumeNative: s.externalVolumeNative,
            points: userStatPoints(s),
            tradeCount: s.tradeCount,
            buyCount: s.buyCount,
            sellCount: s.sellCount,
        }
    })

    return c.json({ traders: await withReferredPoints(chainId, traders) })
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

    const raw: NativePricePoint[] = []
    if (source === 'bc') {
        const rows = await db
            .select()
            .from(schema.swapEvent)
            .where(
                and(
                    eq(schema.swapEvent.chainId, chainId),
                    eq(schema.swapEvent.tokenAddr, tokenAddr),
                    gte(schema.swapEvent.timestamp, since)
                )
            )
        for (const r of rows) {
            raw.push({
                timestamp: r.timestamp,
                price: calculatePrice({
                    timestamp: r.timestamp,
                    isBuy: r.isBuy === 1,
                    amountIn: 0n,
                    amountOut: 0n,
                    reserveIn: BigInt(r.reserveIn),
                    reserveOut: BigInt(r.reserveOut),
                }),
            })
        }
    } else {
        const rows = await db
            .select()
            .from(schema.v3SwapEvent)
            .where(
                and(
                    eq(schema.v3SwapEvent.chainId, chainId),
                    eq(schema.v3SwapEvent.tokenAddr, tokenAddr),
                    gte(schema.v3SwapEvent.timestamp, since)
                )
            )
        for (const r of rows) {
            raw.push({
                timestamp: r.timestamp,
                price: calculatePriceFromSqrtPrice(BigInt(r.sqrtPriceX96), r.tokenIsToken0 === 1),
            })
        }
    }

    const points = sanitizePricePoints(raw).sort((a, b) => a.timestamp - b.timestamp)
    return c.json({ points })
})

export default app

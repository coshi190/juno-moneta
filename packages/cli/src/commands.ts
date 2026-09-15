import {
    fetchAllReferralBindings,
    fetchDepositsByOwner,
    fetchIncentives,
    fetchIndexerStatus,
    fetchLaunchTokens,
    fetchNativeUsdPrice,
    fetchNativeUsdPriceSnapshots,
    fetchPoolMetrics,
    fetchPositionsByTokenIds,
    fetchRecentSwaps,
    fetchReferralBindings,
    fetchReferralRewards,
    fetchTokenHolders,
    fetchTokenSnapshots,
    fetchUserStats,
    fetchUserPositions,
    fetchV3TokenSnapshots,
} from '@coshi190/juno-moneta-sdk'
import { resolveAggregatePlan } from './chain.js'
import { createPonderClient } from './ponder-client.js'
import { fetchIncentiveAnalytics, toTableRow } from './incentive-analytics.js'
import {
    optionalAddress,
    optionalAddressList,
    optionalChainId,
    optionalGraduated,
    optionalLimit,
    optionalOrder,
    optionalProtocol,
    parseAddress,
    parseAddressList,
    parseChainId,
    parseDecimalAmount,
    parseFields,
    parsePonderUrl,
    parseRpcUrl,
    parseTokenIds,
} from './args.js'

interface CommandArgs {
    chainId?: string | undefined
    protocol?: string | undefined
    users?: string | undefined
    owner?: string | undefined
    tokenIds?: string | undefined
    referrer?: string | undefined
    tokenAddr?: string | undefined
    tokenAddrs?: string | undefined
    tokenIn?: string | undefined
    tokenOut?: string | undefined
    amountIn?: string | undefined
    rpcUrl?: string | undefined
    creator?: string | undefined
    address?: string | undefined
    isGraduated?: string | undefined
    fields?: string | undefined
    orderBy?: string | undefined
    orderDirection?: string | undefined
    limit?: string | undefined
    ponderUrl?: string | undefined
    json?: boolean | undefined
}

export interface Command {
    group: string
    flags: string
    describe: string
    run: (args: CommandArgs) => unknown
}

const DEX = 'dex'
const PONDER = 'ponder'

const CHAIN_FLAG = '--chainId <id|slug>'
const OPTIONAL_CHAIN_FLAG = '[--chainId <id|slug>]'
const PONDER_FLAG = '[--ponderUrl <url>]'

interface LaunchToken {
    tokenAddr: string
    chainId: number
    creator: string
    name: string | null
    symbol: string | null
    logo: string | null
    description: string | null
    link1: string | null
    link2: string | null
    link3: string | null
    createdTime: number
    isGraduated: number | null
    graduatedAt: number | null
    createdAtBlock: number
}

interface TokenHolder {
    id: string
    chainId: number
    tokenAddr: string
    address: string
    balance: string
}

interface TokenSnapshot {
    tokenAddr: string
    chainId: number
    lastPrice: string | null
    lastPriceUsd: string | null
    marketCapNative: string | null
    athMarketCapNative: string | null
    totalBuys: number | null
    totalSells: number | null
    totalVolumeNative: string | null
    holderCount: number | null
    creatorFeeNative: string | null
    creatorFeeClaimedNative: string | null
    creatorFeeToken: string | null
    creatorFeeClaimedToken: string | null
    lastSwapAt: number | null
    price1dAgo: string | null
    price1dAgoTimestamp: number | null
    priceChange1dPct: string | null
    updatedAt: number
}

const LAUNCH_TOKEN_DETAIL_FIELDS = [
    'tokenAddr',
    'creator',
    'name',
    'symbol',
    'logo',
    'description',
    'link1',
    'link2',
    'link3',
    'createdTime',
    'isGraduated',
    'graduatedAt',
] as const satisfies readonly (keyof LaunchToken)[]

const LAUNCH_TOKEN_META_FIELDS = [
    'tokenAddr',
    'name',
    'symbol',
    'logo',
] as const satisfies readonly (keyof LaunchToken)[]

const LAUNCH_TOKEN_CARD_FIELDS = [
    'tokenAddr',
    'name',
    'symbol',
    'logo',
    'isGraduated',
] as const satisfies readonly (keyof LaunchToken)[]

const TOKEN_SNAPSHOT_LIST_FIELDS = [
    'tokenAddr',
    'lastSwapAt',
    'marketCapNative',
    'athMarketCapNative',
    'lastPrice',
    'price1dAgoTimestamp',
    'priceChange1dPct',
] as const satisfies readonly (keyof TokenSnapshot)[]

const TOKEN_SNAPSHOT_CREATOR_FIELDS = [
    'tokenAddr',
    'marketCapNative',
    'creatorFeeNative',
    'creatorFeeClaimedNative',
    'creatorFeeToken',
    'creatorFeeClaimedToken',
    'lastPriceUsd',
] as const satisfies readonly (keyof TokenSnapshot)[]

const TOKEN_SNAPSHOT_HOLDER_COUNT_FIELDS = [
    'holderCount',
] as const satisfies readonly (keyof TokenSnapshot)[]

const TOKEN_HOLDER_ADDRESS_FIELDS = ['address'] as const satisfies readonly (keyof TokenHolder)[]

const TOKEN_HOLDER_BALANCE_FIELDS = [
    'tokenAddr',
    'balance',
] as const satisfies readonly (keyof TokenHolder)[]

const LAUNCH_TOKEN_PRESETS: Record<string, readonly (keyof LaunchToken)[]> = {
    detail: LAUNCH_TOKEN_DETAIL_FIELDS,
    meta: LAUNCH_TOKEN_META_FIELDS,
    card: LAUNCH_TOKEN_CARD_FIELDS,
}

const TOKEN_SNAPSHOT_PRESETS: Record<string, readonly (keyof TokenSnapshot)[]> = {
    list: TOKEN_SNAPSHOT_LIST_FIELDS,
    creator: TOKEN_SNAPSHOT_CREATOR_FIELDS,
    holderCount: TOKEN_SNAPSHOT_HOLDER_COUNT_FIELDS,
}

const TOKEN_HOLDER_PRESETS: Record<string, readonly (keyof TokenHolder)[]> = {
    address: TOKEN_HOLDER_ADDRESS_FIELDS,
    balance: TOKEN_HOLDER_BALANCE_FIELDS,
}

function selectFlags(presets: Record<string, unknown>): string {
    const fields = `[--fields ${Object.keys(presets).join('|')}|a,b,c]`
    return `${fields} [--orderBy <field>] [--orderDirection asc|desc=asc]`
}

export const COMMANDS: Record<string, Command> = {
    pickAggregatePlan: {
        group: DEX,
        flags: `${CHAIN_FLAG} --tokenIn <sold> --tokenOut <bought> --amountIn <tokens> [--rpcUrl <url=$JUNO_MONETA_RPC_URL>]`,
        describe:
            'Best aggregated route for a pair, split across dexes or hopped through a connector',
        run: async (args) => {
            const chainId = parseChainId(args.chainId)
            const picked = await resolveAggregatePlan({
                chainId,
                tokenIn: parseAddress(args.tokenIn, 'tokenIn'),
                tokenOut: parseAddress(args.tokenOut, 'tokenOut'),
                amount: parseDecimalAmount(args.amountIn, 'amountIn'),
                rpcUrl: parseRpcUrl(args.rpcUrl, chainId),
            })
            if (!picked || args.json) return picked
            return {
                kind: picked.plan.kind,
                predictedNetOut: picked.plan.predictedNetOut,
                bestSingleOut: picked.bestSingleOut,
                beatsSingle: picked.beatsSingle,
                legs: picked.legs.map((leg) => ({
                    percent: leg.percent,
                    route: [
                        leg.hops[0]!.symbolIn,
                        ...leg.hops.map((h) => `${h.dexId} → ${h.symbolOut}`),
                    ].join(' → '),
                })),
            }
        },
    },

    fetchUserStats: {
        group: PONDER,
        flags: `${CHAIN_FLAG} --users <addr,addr> ${PONDER_FLAG}`,
        describe:
            'Aggregate trade volume, counts, points, and USD volume per user from the indexer',
        run: async (args) => {
            const chainId = parseChainId(args.chainId)
            const users = parseAddressList(args.users, 'users')
            const client = createPonderClient(parsePonderUrl(args.ponderUrl))
            const nativeUsdPrice = await fetchNativeUsdPrice(client, { chainId })
            return fetchUserStats(client, { chainId, users, nativeUsdPrice })
        },
    },
    fetchIndexerStatus: {
        group: PONDER,
        flags: PONDER_FLAG,
        describe: 'Latest indexed block and lag per chain from the indexer',
        run: (args) => fetchIndexerStatus(createPonderClient(parsePonderUrl(args.ponderUrl))),
    },
    fetchAllReferralBindings: {
        group: PONDER,
        flags: PONDER_FLAG,
        describe: 'Every referee and referrer pair from the indexer, oldest binding first',
        run: (args) => fetchAllReferralBindings(createPonderClient(parsePonderUrl(args.ponderUrl))),
    },
    fetchReferralBindings: {
        group: PONDER,
        flags: `--referrer <addr> ${PONDER_FLAG}`,
        describe: 'Referees bound to a referrer, oldest binding first',
        run: (args) =>
            fetchReferralBindings(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                referrer: parseAddress(args.referrer, 'referrer'),
            }),
    },
    fetchReferralRewards: {
        group: PONDER,
        flags: `${CHAIN_FLAG} --referrer <addr> ${PONDER_FLAG}`,
        describe: 'Referral points and referred trader breakdown for a referrer',
        run: async (args) => {
            const chainId = parseChainId(args.chainId)
            const referrer = parseAddress(args.referrer, 'referrer')
            const client = createPonderClient(parsePonderUrl(args.ponderUrl))
            const nativeUsdPrice = await fetchNativeUsdPrice(client, { chainId })
            return fetchReferralRewards(client, { chainId, referrer, nativeUsdPrice })
        },
    },
    fetchIncentives: {
        group: PONDER,
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe:
            'V3 staker incentives on a chain, with reward token, pool, window, and refund state',
        run: (args) =>
            fetchIncentives(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchIncentiveAnalytics: {
        group: PONDER,
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe:
            'Per-program V3 staker insight, with status, schedule, emission rate, reward value, and APR against pool TVL, --json for every field',
        run: async (args) => {
            const analytics = await fetchIncentiveAnalytics(
                createPonderClient(parsePonderUrl(args.ponderUrl)),
                { chainId: parseChainId(args.chainId), limit: optionalLimit(args.limit) }
            )
            if (args.json) return analytics
            return { totals: analytics.totals, programs: analytics.programs.map(toTableRow) }
        },
    },
    fetchDepositsByOwner: {
        group: PONDER,
        flags: `${CHAIN_FLAG} --owner <addr> [--limit <n>] ${PONDER_FLAG}`,
        describe: 'V3 staker deposits held by an owner on a chain, with position token id',
        run: (args) =>
            fetchDepositsByOwner(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
                owner: parseAddress(args.owner, 'owner'),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchLaunchTokens: {
        group: PONDER,
        flags: `${OPTIONAL_CHAIN_FLAG} [--creator <addr>] [--isGraduated 0|1] [--tokenAddrs <a,a>] ${selectFlags(LAUNCH_TOKEN_PRESETS)} ${PONDER_FLAG}`,
        describe: 'Launchpad tokens from the indexer, filtered by chain, creator, or graduation',
        run: (args) =>
            fetchLaunchTokens(
                createPonderClient(parsePonderUrl(args.ponderUrl)),
                {
                    chainId: optionalChainId(args.chainId),
                    creator: optionalAddress(args.creator),
                    isGraduated: optionalGraduated(args.isGraduated),
                    tokenAddrs: optionalAddressList(args.tokenAddrs),
                },
                parseFields<LaunchToken>(
                    args.fields,
                    LAUNCH_TOKEN_PRESETS,
                    LAUNCH_TOKEN_CARD_FIELDS
                ),
                optionalOrder<LaunchToken>(args.orderBy, args.orderDirection)
            ),
    },
    fetchTokenSnapshots: {
        group: PONDER,
        flags: `${OPTIONAL_CHAIN_FLAG} [--tokenAddrs <a,a>] ${selectFlags(TOKEN_SNAPSHOT_PRESETS)} ${PONDER_FLAG}`,
        describe: 'Per-token market cap, price, fee, and holder snapshots from the indexer',
        run: (args) =>
            fetchTokenSnapshots(
                createPonderClient(parsePonderUrl(args.ponderUrl)),
                {
                    chainId: optionalChainId(args.chainId),
                    tokenAddrs: optionalAddressList(args.tokenAddrs),
                },
                parseFields<TokenSnapshot>(
                    args.fields,
                    TOKEN_SNAPSHOT_PRESETS,
                    TOKEN_SNAPSHOT_LIST_FIELDS
                ),
                optionalOrder<TokenSnapshot>(args.orderBy, args.orderDirection)
            ),
    },
    fetchTokenHolders: {
        group: PONDER,
        flags: `${OPTIONAL_CHAIN_FLAG} [--tokenAddr <addr>] [--address <holder>] ${selectFlags(TOKEN_HOLDER_PRESETS)} ${PONDER_FLAG}`,
        describe: 'Launch token holders and balances from the indexer',
        run: (args) =>
            fetchTokenHolders(
                createPonderClient(parsePonderUrl(args.ponderUrl)),
                {
                    chainId: optionalChainId(args.chainId),
                    tokenAddr: optionalAddress(args.tokenAddr),
                    address: optionalAddress(args.address),
                },
                parseFields<TokenHolder>(
                    args.fields,
                    TOKEN_HOLDER_PRESETS,
                    TOKEN_HOLDER_BALANCE_FIELDS
                ),
                optionalOrder<TokenHolder>(args.orderBy, args.orderDirection)
            ),
    },
    fetchRecentSwaps: {
        group: PONDER,
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe: 'Latest bonding curve swaps on a chain, newest first, with token metadata',
        run: (args) =>
            fetchRecentSwaps(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchUserPositions: {
        group: PONDER,
        flags: `${CHAIN_FLAG} --owner <addr> [--limit <n>] ${PONDER_FLAG}`,
        describe: 'V3 positions held by an owner on a chain, with range, liquidity, and fees owed',
        run: (args) =>
            fetchUserPositions(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
                owner: parseAddress(args.owner, 'owner'),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchPositionsByTokenIds: {
        group: PONDER,
        flags: `${CHAIN_FLAG} --tokenIds <id,id> [--limit <n>] ${PONDER_FLAG}`,
        describe: 'V3 positions on a chain looked up by NFT token id',
        run: (args) =>
            fetchPositionsByTokenIds(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
                tokenIds: parseTokenIds(args.tokenIds),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchPoolMetrics: {
        group: PONDER,
        flags: `${CHAIN_FLAG} [--protocol <name=junoswap>] [--limit <n>] ${PONDER_FLAG}`,
        describe:
            'Pools on a chain with token metadata, price, TVL, 1d and 30d volume, and fee APR',
        run: (args) =>
            fetchPoolMetrics(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
                protocol: optionalProtocol(args.protocol),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchNativeUsdPrice: {
        group: PONDER,
        flags: `${CHAIN_FLAG} ${PONDER_FLAG}`,
        describe: 'Current native token price in USD on a chain, from the indexer',
        run: (args) =>
            fetchNativeUsdPrice(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
            }),
    },
    fetchNativeUsdPriceSnapshots: {
        group: PONDER,
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe:
            'Native token USD price history on a chain, oldest first, --limit keeps the newest n',
        run: async (args) => {
            const rows = await fetchNativeUsdPriceSnapshots(
                createPonderClient(parsePonderUrl(args.ponderUrl)),
                { chainId: parseChainId(args.chainId) }
            )
            const limit = optionalLimit(args.limit)
            return limit === undefined ? rows : rows.slice(-limit)
        },
    },
    fetchV3TokenSnapshots: {
        group: PONDER,
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe: 'Latest USD price per V3 token on a chain, from the indexer',
        run: (args) =>
            fetchV3TokenSnapshots(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId: parseChainId(args.chainId),
                limit: optionalLimit(args.limit),
            }),
    },
}

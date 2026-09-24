import * as sdk from '@coshi190/juno-moneta-sdk'
import { createPonderClient, type PonderClient } from './ponder-client.js'
import {
    optionalAddress,
    optionalAddressList,
    optionalChainId,
    optionalFlag,
    optionalLimit,
    optionalName,
    optionalNonNegativeInt,
    optionalOrder,
    parseAddress,
    parseAddressList,
    parseChainId,
    parseEnum,
    parseFields,
    parseInteger,
    parsePonderUrl,
    parseTime,
    parseTokenIds,
} from './args.js'

export const OPTIONS = {
    chainId: { type: 'string' },
    protocol: { type: 'string' },
    launchpadId: { type: 'string' },
    users: { type: 'string' },
    owner: { type: 'string' },
    tokenIds: { type: 'string' },
    referrer: { type: 'string' },
    tokenAddr: { type: 'string' },
    tokenAddrs: { type: 'string' },
    creator: { type: 'string' },
    address: { type: 'string' },
    isGraduated: { type: 'string' },
    fields: { type: 'string' },
    orderBy: { type: 'string' },
    orderDirection: { type: 'string' },
    limit: { type: 'string' },
    ponderUrl: { type: 'string' },
    sender: { type: 'string' },
    after: { type: 'string' },
    offset: { type: 'string' },
    isBuy: { type: 'string' },
    txFrom: { type: 'string' },
    poolAddress: { type: 'string' },
    since: { type: 'string' },
    before: { type: 'string' },
    source: { type: 'string' },
    duration: { type: 'string' },
    addresses: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
} as const

type CommandArgs = {
    [K in keyof typeof OPTIONS]?: (typeof OPTIONS)[K] extends { type: 'boolean' } ? boolean : string
}

export interface Command {
    flags: string
    describe: string
    run: (args: CommandArgs) => unknown
}

const PONDER_FLAG = '[--ponderUrl <url=$JUNO_MONETA_PONDER_URL>]'
const CANDLE_SOURCES = ['bc', 'v3'] as const
const DEFAULT_ACTIVITY_LIMIT = 50

function ponder(args: CommandArgs) {
    return createPonderClient(parsePonderUrl(args.ponderUrl))
}

const FLAG = {
    address: '[--address <holder>]',
    addresses: '[--addresses <a,a>]',
    after: '[--after <cursor>]',
    before: '--before <unix|30m|24h|7d>',
    chainId: '--chainId <id|slug>',
    chainId$opt: '[--chainId <id|slug>]',
    creator: '[--creator <addr>]',
    duration: '--duration <60|300|900|3600|14400|86400>',
    isBuy: '[--isBuy 0|1]',
    isGraduated: '[--isGraduated 0|1]',
    launchpadId: '[--launchpadId <id>]',
    limit: '[--limit <n>]',
    limit$50: '[--limit <n=50>]',
    limit$500: '[--limit <n=500>]',
    offset: '[--offset <n=0>]',
    owner: '--owner <addr>',
    poolAddress: '--poolAddress <addr>',
    poolAddress$opt: '[--poolAddress <addr>]',
    protocol: '[--protocol <name>]',
    protocol$junoswap: '[--protocol <name=junoswap>]',
    referrer: '--referrer <addr>',
    sender: '--sender <addr>',
    sender$opt: '[--sender <addr>]',
    since: '--since <unix|30m|24h|7d>',
    source: '--source bc|v3',
    tokenAddr: '--tokenAddr <addr>',
    tokenAddr$opt: '[--tokenAddr <addr>]',
    tokenAddrs: '[--tokenAddrs <a,a>]',
    tokenIds: '--tokenIds <id,id>',
    txFrom: '[--txFrom <addr>]',
    users: '--users <addr,addr>',
} as const satisfies Record<string, string>

type ArgKey = keyof typeof FLAG
type Parse = (args: CommandArgs) => unknown

const PARSE = {
    address: (a) => optionalAddress(a.address),
    addresses: (a) => optionalAddressList(a.addresses),
    after: (a) => a.after,
    before: (a) => parseTime(a.before, 'before'),
    chainId: (a) => parseChainId(a.chainId),
    chainId$opt: (a) => optionalChainId(a.chainId),
    creator: (a) => optionalAddress(a.creator),
    duration: (a) => parseInteger(a.duration, 'duration'),
    isBuy: (a) => optionalFlag(a.isBuy, 'isBuy'),
    isGraduated: (a) => optionalFlag(a.isGraduated, 'isGraduated'),
    launchpadId: (a) => optionalName(a.launchpadId, 'launchpadId'),
    limit: (a) => optionalLimit(a.limit),
    limit$50: (a) => optionalLimit(a.limit) ?? DEFAULT_ACTIVITY_LIMIT,
    limit$500: (a) => optionalLimit(a.limit),
    offset: (a) => optionalNonNegativeInt(a.offset, 'offset') ?? 0,
    owner: (a) => parseAddress(a.owner, 'owner'),
    poolAddress: (a) => parseAddress(a.poolAddress, 'poolAddress'),
    poolAddress$opt: (a) => optionalAddress(a.poolAddress),
    protocol: (a) => optionalName(a.protocol, 'protocol'),
    protocol$junoswap: (a) => optionalName(a.protocol, 'protocol'),
    referrer: (a) => parseAddress(a.referrer, 'referrer'),
    sender: (a) => parseAddress(a.sender, 'sender'),
    sender$opt: (a) => optionalAddress(a.sender),
    since: (a) => parseTime(a.since, 'since'),
    source: (a) => parseEnum(a.source, 'source', CANDLE_SOURCES),
    tokenAddr: (a) => parseAddress(a.tokenAddr, 'tokenAddr'),
    tokenAddr$opt: (a) => optionalAddress(a.tokenAddr),
    tokenAddrs: (a) => optionalAddressList(a.tokenAddrs),
    tokenIds: (a) => parseTokenIds(a.tokenIds),
    txFrom: (a) => optionalAddress(a.txFrom),
    users: (a) => parseAddressList(a.users, 'users'),
} satisfies Record<ArgKey, Parse>

type ParamName<K> = K extends `${infer P}$${string}` ? P : K
type Params<K extends ArgKey> = { [P in K as ParamName<P>]: ReturnType<(typeof PARSE)[P]> }

function flagsFor(keys: readonly ArgKey[], ...extra: string[]): string {
    return [...keys.map((key) => FLAG[key]), ...extra, PONDER_FLAG].join(' ')
}

function paramsFor<K extends ArgKey>(keys: readonly K[], args: CommandArgs): Params<K> {
    const entries = keys.map((key) => [key.replace(/\$.*$/, ''), PARSE[key](args)] as const)
    return Object.fromEntries(entries) as Params<K>
}

function q<K extends ArgKey>(
    fn: (client: PonderClient, params: Params<K>) => unknown,
    keys: readonly K[],
    describe: string
): Command {
    return {
        flags: flagsFor(keys),
        describe,
        run: (args) => fn(ponder(args), paramsFor(keys, args)),
    }
}

type LaunchTokenField = Parameters<typeof sdk.fetchLaunchTokens>[2][number]
type TokenSnapshotField = Parameters<typeof sdk.fetchTokenSnapshots>[2][number]
type TokenHolderField = Parameters<typeof sdk.fetchTokenHolders>[2][number]

const LAUNCH_TOKEN_PRESETS = {
    detail: [
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
        'launchpadId',
        'market',
        'isGraduated',
        'graduatedAt',
        'ammPool',
        'graduationTarget',
    ],
    meta: ['tokenAddr', 'name', 'symbol', 'logo'],
    card: ['tokenAddr', 'name', 'symbol', 'logo', 'isGraduated'],
} as const satisfies Record<string, readonly LaunchTokenField[]>

const TOKEN_SNAPSHOT_PRESETS = {
    list: [
        'tokenAddr',
        'lastSwapAt',
        'marketCapNative',
        'athMarketCapNative',
        'lastPrice',
        'price1dAgoTimestamp',
        'priceChange1dPct',
    ],
    creator: [
        'tokenAddr',
        'marketCapNative',
        'creatorFeeNative',
        'creatorFeeClaimedNative',
        'creatorFeeToken',
        'creatorFeeClaimedToken',
        'lastPriceUsd',
    ],
    holderCount: ['holderCount'],
} as const satisfies Record<string, readonly TokenSnapshotField[]>

const TOKEN_HOLDER_PRESETS = {
    address: ['address'],
    balance: ['tokenAddr', 'balance'],
} as const satisfies Record<string, readonly TokenHolderField[]>

function selectFlags(presets: Record<string, unknown>): string {
    const fields = `[--fields ${Object.keys(presets).join('|')}|a,b,c]`
    return `${fields} [--orderBy <field>] [--orderDirection asc|desc=asc]`
}

const LAUNCH_TOKEN_FILTER = [
    'chainId$opt',
    'launchpadId',
    'creator',
    'isGraduated',
    'tokenAddrs',
] as const
const TOKEN_SNAPSHOT_FILTER = ['chainId$opt', 'launchpadId', 'tokenAddrs'] as const
const TOKEN_HOLDER_FILTER = ['chainId$opt', 'tokenAddr$opt', 'address'] as const

export const COMMANDS: Record<string, Command> = {
    fetchUserStats: q(
        sdk.fetchUserStats,
        ['chainId', 'users'],
        'Aggregate trade volume, counts, points, and USD volume per user from the indexer'
    ),
    fetchIndexerStatus: q(
        sdk.fetchIndexerStatus,
        [],
        'Latest indexed block and lag per chain from the indexer'
    ),
    fetchAllReferralBindings: q(
        sdk.fetchAllReferralBindings,
        [],
        'Every referee and referrer pair from the indexer, oldest binding first'
    ),
    fetchReferralBindings: q(
        sdk.fetchReferralBindings,
        ['referrer'],
        'Referees bound to a referrer, oldest binding first'
    ),
    fetchReferralRewards: q(
        sdk.fetchReferralRewards,
        ['chainId', 'referrer'],
        'Referral points and referred trader breakdown for a referrer'
    ),
    fetchIncentives: q(
        sdk.fetchIncentives,
        ['chainId', 'limit'],
        'V3 staker incentives on a chain, with reward token, pool, window, and refund state'
    ),
    fetchDepositsByOwner: q(
        sdk.fetchDepositsByOwner,
        ['chainId', 'owner', 'limit'],
        'V3 staker deposits held by an owner on a chain, with position token id'
    ),
    fetchLaunchTokens: {
        flags: flagsFor(LAUNCH_TOKEN_FILTER, selectFlags(LAUNCH_TOKEN_PRESETS)),
        describe:
            'Launchpad tokens from the indexer, filtered by chain, launchpad, creator, or graduation',
        run: (args) =>
            sdk.fetchLaunchTokens(
                ponder(args),
                paramsFor(LAUNCH_TOKEN_FILTER, args),
                parseFields<LaunchTokenField>(
                    args.fields,
                    LAUNCH_TOKEN_PRESETS,
                    LAUNCH_TOKEN_PRESETS.card
                ),
                optionalOrder<LaunchTokenField>(args.orderBy, args.orderDirection)
            ),
    },
    fetchTokenSnapshots: {
        flags: flagsFor(TOKEN_SNAPSHOT_FILTER, selectFlags(TOKEN_SNAPSHOT_PRESETS)),
        describe:
            'Per-token market cap, price, fee, and holder snapshots from the indexer, filtered by chain or launchpad',
        run: (args) =>
            sdk.fetchTokenSnapshots(
                ponder(args),
                paramsFor(TOKEN_SNAPSHOT_FILTER, args),
                parseFields<TokenSnapshotField>(
                    args.fields,
                    TOKEN_SNAPSHOT_PRESETS,
                    TOKEN_SNAPSHOT_PRESETS.list
                ),
                optionalOrder<TokenSnapshotField>(args.orderBy, args.orderDirection)
            ),
    },
    fetchTokenHolders: {
        flags: flagsFor(TOKEN_HOLDER_FILTER, selectFlags(TOKEN_HOLDER_PRESETS)),
        describe: 'Launch token holders and balances from the indexer',
        run: (args) =>
            sdk.fetchTokenHolders(
                ponder(args),
                paramsFor(TOKEN_HOLDER_FILTER, args),
                parseFields<TokenHolderField>(
                    args.fields,
                    TOKEN_HOLDER_PRESETS,
                    TOKEN_HOLDER_PRESETS.balance
                ),
                optionalOrder<TokenHolderField>(args.orderBy, args.orderDirection)
            ),
    },
    fetchRecentSwaps: q(
        sdk.fetchRecentSwaps,
        ['chainId', 'limit'],
        'Latest bonding curve swaps on a chain, newest first, with token metadata'
    ),
    fetchUserPositions: q(
        sdk.fetchUserPositions,
        ['chainId', 'owner', 'limit'],
        'V3 positions held by an owner on a chain, with range, liquidity, and fees owed'
    ),
    fetchPositionsByTokenIds: q(
        sdk.fetchPositionsByTokenIds,
        ['chainId', 'tokenIds', 'limit'],
        'V3 positions on a chain looked up by NFT token id'
    ),
    fetchPoolMetrics: q(
        sdk.fetchPoolMetrics,
        ['chainId', 'protocol$junoswap', 'limit'],
        'Pools on a chain with token metadata, price, TVL, 1d and 30d volume, and fee APR'
    ),
    fetchNativeUsdPrice: q(
        sdk.fetchNativeUsdPrice,
        ['chainId'],
        'Current native token price in USD on a chain, from the indexer'
    ),
    fetchNativeUsdPriceSnapshots: {
        flags: flagsFor(['chainId', 'limit']),
        describe:
            'Native token USD price history on a chain, oldest first, --limit keeps the newest n',
        run: async (args) => {
            const rows = await sdk.fetchNativeUsdPriceSnapshots(ponder(args), {
                chainId: parseChainId(args.chainId),
            })
            const limit = optionalLimit(args.limit)
            return limit === undefined ? rows : rows.slice(-limit)
        },
    },
    fetchUserBondingCurveSwaps: q(
        sdk.fetchUserBondingCurveSwaps,
        ['chainId', 'sender', 'limit$50', 'after'],
        'Bonding curve swaps sent by an address on a chain, newest first'
    ),
    fetchUserV3Swaps: q(
        sdk.fetchUserV3Swaps,
        ['chainId', 'sender', 'limit$50', 'after'],
        'V3 swaps sent by an address on a chain, newest first'
    ),
    fetchUserV2Swaps: q(
        sdk.fetchUserV2Swaps,
        ['chainId', 'sender', 'limit$50', 'after'],
        'V2 swaps sent by an address on a chain, newest first'
    ),
    fetchUserAggSwaps: q(
        sdk.fetchUserAggSwaps,
        ['chainId', 'sender', 'limit$50', 'after'],
        'Aggregate router swaps sent by an address on a chain, newest first'
    ),
    fetchUserTransfers: q(
        sdk.fetchUserTransfers,
        ['chainId', 'sender', 'limit$50'],
        'Token transfers into or out of an address on a chain, newest first'
    ),
    fetchTokenBondingCurveSwaps: q(
        sdk.fetchTokenBondingCurveSwaps,
        ['tokenAddr', 'limit$50', 'offset', 'isBuy', 'sender$opt'],
        'One page of bonding curve swaps for a token, newest first, with total count'
    ),
    fetchTokenV3Swaps: q(
        sdk.fetchTokenV3Swaps,
        ['chainId', 'tokenAddr', 'limit$50', 'offset', 'txFrom', 'poolAddress$opt'],
        'One page of V3 swaps for a token, newest first, with total count'
    ),
    fetchBondingCurveHistory: q(
        sdk.fetchBondingCurveHistory,
        ['tokenAddr'],
        'Every bonding curve swap for a token, oldest first, with reserves'
    ),
    fetchV3History: q(
        sdk.fetchV3History,
        ['chainId', 'tokenAddr', 'poolAddress$opt'],
        'Every V3 swap for a token, oldest first, with tick and sqrt price'
    ),
    fetchTokenCandles: q(
        sdk.fetchTokenCandles,
        ['chainId', 'tokenAddr', 'source', 'duration', 'since'],
        'OHLC candles for a token on one source and bucket size, oldest first'
    ),
    fetchBondingCurvePricesSince: q(
        sdk.fetchBondingCurvePricesSince,
        ['tokenAddr', 'since'],
        'Bonding curve price points for a token since a time, oldest first'
    ),
    fetchV3PricesSince: q(
        sdk.fetchV3PricesSince,
        ['chainId', 'tokenAddr', 'since', 'poolAddress$opt'],
        'V3 price points for a token since a time, oldest first'
    ),
    fetchPoolPriceHistory: q(
        sdk.fetchPoolPriceHistory,
        ['chainId', 'poolAddress', 'since'],
        'Sqrt price points for one V3 pool since a time, oldest first'
    ),
    fetchPoolPriceAnchor: q(
        sdk.fetchPoolPriceAnchor,
        ['chainId', 'poolAddress', 'before'],
        'The last V3 pool price point at or before a time, for anchoring a change'
    ),
    fetchV3Pools: q(
        sdk.fetchV3Pools,
        ['chainId', 'protocol', 'addresses', 'limit$500'],
        'V3 pools on a chain with their token pair, fee tier, and tick spacing'
    ),
    fetchV3Tokens: q(
        sdk.fetchV3Tokens,
        ['chainId', 'limit$500'],
        'Tokens seen in V3 pools on a chain, with symbol, name, and decimals'
    ),
    fetchV3TokenSnapshots: q(
        sdk.fetchV3TokenSnapshots,
        ['chainId', 'limit'],
        'Latest USD price per V3 token on a chain, from the indexer'
    ),
}

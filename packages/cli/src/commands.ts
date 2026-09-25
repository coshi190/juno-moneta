import * as sdk from '@coshi190/juno-moneta-sdk'
import { createPonderClient, type PonderClient } from './ponder-client.js'
import {
    optional,
    optionalOrder,
    parseAddress,
    parseAddressList,
    parseBit,
    parseChainId,
    parseEnum,
    parseFields,
    parseInteger,
    parseName,
    parsePonderUrl,
    parsePositiveInt,
    parseTime,
    parseTokenIds,
    parseUint,
    type Parse,
    type QueryOrder,
} from './args.js'

const ARGS = {
    address: ['[--address <holder>]', optional(parseAddress)],
    addresses: ['[--addresses <a,a>]', optional(parseAddressList)],
    after: ['[--after <cursor>]', (value) => value],
    before: ['--before <unix|30m|24h|7d>', parseTime],
    chainId: ['--chainId <id|slug>', parseChainId],
    chainId$opt: ['[--chainId <id|slug>]', optional(parseChainId)],
    creator: ['[--creator <addr>]', optional(parseAddress)],
    duration: ['--duration <60|300|900|3600|14400|86400>', parseInteger],
    isBuy: ['[--isBuy 0|1]', optional(parseBit)],
    isGraduated: ['[--isGraduated 0|1]', optional(parseBit)],
    launchpadId: ['[--launchpadId <id>]', optional(parseName)],
    limit: ['[--limit <n>]', optional(parsePositiveInt)],
    limit$50: ['[--limit <n=50>]', optional(parsePositiveInt, 50)],
    offset: ['[--offset <n=0>]', optional(parseUint, 0)],
    owner: ['--owner <addr>', parseAddress],
    poolAddress: ['--poolAddress <addr>', parseAddress],
    poolAddress$opt: ['[--poolAddress <addr>]', optional(parseAddress)],
    protocol: ['[--protocol <name>]', optional(parseName)],
    referrer: ['--referrer <addr>', parseAddress],
    sender: ['--sender <addr>', parseAddress],
    sender$opt: ['[--sender <addr>]', optional(parseAddress)],
    since: ['--since <unix|30m|24h|7d>', parseTime],
    source: ['--source bc|v3', parseEnum(['bc', 'v3'] as const)],
    tokenAddr: ['--tokenAddr <addr>', parseAddress],
    tokenAddr$opt: ['[--tokenAddr <addr>]', optional(parseAddress)],
    tokenAddrs: ['[--tokenAddrs <a,a>]', optional(parseAddressList)],
    tokenIds: ['--tokenIds <id,id>', parseTokenIds],
    txFrom: ['[--txFrom <addr>]', optional(parseAddress)],
    users: ['--users <addr,addr>', parseAddressList],
} satisfies Record<string, readonly [string, Parse<unknown>]>

type ArgKey = keyof typeof ARGS
type ParamName<K> = K extends `${infer P}$${string}` ? P : K
type Params<K extends ArgKey> = { [P in K as ParamName<P>]: ReturnType<(typeof ARGS)[P][1]> }

const paramName = <K extends string>(key: K) => key.replace(/\$.*$/, '') as ParamName<K>

const STRING_OPTIONS = ['fields', 'orderBy', 'orderDirection', 'ponderUrl'] as const
type StringOption = ParamName<ArgKey> | (typeof STRING_OPTIONS)[number]

export const OPTIONS = {
    ...(Object.fromEntries(
        [...Object.keys(ARGS).map(paramName), ...STRING_OPTIONS].map((name) => [
            name,
            { type: 'string' },
        ])
    ) as Record<StringOption, { type: 'string' }>),
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
} as const

type CommandArgs = Partial<Record<StringOption, string>> & { json?: boolean; help?: boolean }

export interface Command {
    flags: string[]
    describe: string
    run: (args: CommandArgs) => unknown
}

function ponder(args: CommandArgs) {
    return createPonderClient(parsePonderUrl(args.ponderUrl))
}

function flagsFor(keys: readonly ArgKey[], ...extra: string[]): string[] {
    return [
        ...keys.map((key) => ARGS[key][0]),
        ...extra,
        '[--ponderUrl <url=$JUNO_MONETA_PONDER_URL>]',
    ]
}

function paramsFor<K extends ArgKey>(keys: readonly K[], args: CommandArgs): Params<K> {
    const entries = keys.map((key) => {
        const name = paramName(key)
        return [name, ARGS[key][1](args[name], name)] as const
    })
    return Object.fromEntries(entries) as Params<K>
}

type Runner = Omit<Command, 'describe'>

function q<K extends ArgKey>(
    fn: (client: PonderClient, params: Params<K>) => unknown,
    keys: readonly K[]
): Runner {
    return { flags: flagsFor(keys), run: (args) => fn(ponder(args), paramsFor(keys, args)) }
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

function select<K extends ArgKey, F extends string>(
    fn: (
        client: PonderClient,
        params: Params<K>,
        fields: readonly NoInfer<F>[],
        order?: QueryOrder<NoInfer<F>>
    ) => unknown,
    keys: readonly K[],
    presets: Record<string, readonly F[]>,
    fallback: readonly NoInfer<F>[]
): Runner {
    const fields = `[--fields ${Object.keys(presets).join('|')}|a,b,c]`
    return {
        flags: flagsFor(keys, fields, '[--orderBy <field>]', '[--orderDirection asc|desc=asc]'),
        run: (args) =>
            fn(
                ponder(args),
                paramsFor(keys, args),
                parseFields<F>(args.fields, presets, fallback),
                optionalOrder<F>(args.orderBy, args.orderDirection)
            ),
    }
}

const USER_SWAP = ['chainId', 'sender', 'limit$50', 'after'] as const

const RUNNERS = {
    fetchUserStats: q(sdk.fetchUserStats, ['chainId', 'users']),
    fetchIndexerStatus: q(sdk.fetchIndexerStatus, []),
    fetchAllReferralBindings: q(sdk.fetchAllReferralBindings, []),
    fetchReferralBindings: q(sdk.fetchReferralBindings, ['referrer']),
    fetchReferralRewards: q(sdk.fetchReferralRewards, ['chainId', 'referrer']),
    fetchIncentives: q(sdk.fetchIncentives, ['chainId', 'limit']),
    fetchDepositsByOwner: q(sdk.fetchDepositsByOwner, ['chainId', 'owner', 'limit']),
    fetchLaunchTokens: select(
        sdk.fetchLaunchTokens,
        ['chainId$opt', 'launchpadId', 'creator', 'isGraduated', 'tokenAddrs'],
        LAUNCH_TOKEN_PRESETS,
        LAUNCH_TOKEN_PRESETS.card
    ),
    fetchTokenSnapshots: select(
        sdk.fetchTokenSnapshots,
        ['chainId$opt', 'launchpadId', 'tokenAddrs'],
        TOKEN_SNAPSHOT_PRESETS,
        TOKEN_SNAPSHOT_PRESETS.list
    ),
    fetchTokenHolders: select(
        sdk.fetchTokenHolders,
        ['chainId$opt', 'tokenAddr$opt', 'address'],
        TOKEN_HOLDER_PRESETS,
        TOKEN_HOLDER_PRESETS.balance
    ),
    fetchRecentSwaps: q(sdk.fetchRecentSwaps, ['chainId', 'limit']),
    fetchUserPositions: q(sdk.fetchUserPositions, ['chainId', 'owner', 'limit']),
    fetchPositionsByTokenIds: q(sdk.fetchPositionsByTokenIds, ['chainId', 'tokenIds', 'limit']),
    fetchPoolMetrics: q(sdk.fetchPoolMetrics, ['chainId', 'protocol', 'limit']),
    fetchNativeUsdPrice: q(sdk.fetchNativeUsdPrice, ['chainId']),
    fetchNativeUsdPriceSnapshots: q(
        async (client, { chainId, limit }) => {
            const rows = await sdk.fetchNativeUsdPriceSnapshots(client, { chainId })
            return limit === undefined ? rows : rows.slice(-limit)
        },
        ['chainId', 'limit']
    ),
    fetchUserBondingCurveSwaps: q(sdk.fetchUserBondingCurveSwaps, USER_SWAP),
    fetchUserV3Swaps: q(sdk.fetchUserV3Swaps, USER_SWAP),
    fetchUserV2Swaps: q(sdk.fetchUserV2Swaps, USER_SWAP),
    fetchUserAggSwaps: q(sdk.fetchUserAggSwaps, USER_SWAP),
    fetchUserTransfers: q(sdk.fetchUserTransfers, ['chainId', 'sender', 'limit$50']),
    fetchTokenBondingCurveSwaps: q(sdk.fetchTokenBondingCurveSwaps, [
        'tokenAddr',
        'limit$50',
        'offset',
        'isBuy',
        'sender$opt',
    ]),
    fetchTokenV3Swaps: q(sdk.fetchTokenV3Swaps, [
        'chainId',
        'tokenAddr',
        'limit$50',
        'offset',
        'txFrom',
        'poolAddress$opt',
    ]),
    fetchBondingCurveHistory: q(sdk.fetchBondingCurveHistory, ['tokenAddr']),
    fetchV3History: q(sdk.fetchV3History, ['chainId', 'tokenAddr', 'poolAddress$opt']),
    fetchTokenCandles: q(sdk.fetchTokenCandles, [
        'chainId',
        'tokenAddr',
        'source',
        'duration',
        'since',
    ]),
    fetchBondingCurvePricesSince: q(sdk.fetchBondingCurvePricesSince, ['tokenAddr', 'since']),
    fetchV3PricesSince: q(sdk.fetchV3PricesSince, [
        'chainId',
        'tokenAddr',
        'since',
        'poolAddress$opt',
    ]),
    fetchPoolPriceHistory: q(sdk.fetchPoolPriceHistory, ['chainId', 'poolAddress', 'since']),
    fetchPoolPriceAnchor: q(sdk.fetchPoolPriceAnchor, ['chainId', 'poolAddress', 'before']),
    fetchV3Pools: q(sdk.fetchV3Pools, ['chainId', 'protocol', 'addresses', 'limit']),
    fetchV3Tokens: q(sdk.fetchV3Tokens, ['chainId', 'limit']),
    fetchV3TokenSnapshots: q(sdk.fetchV3TokenSnapshots, ['chainId', 'limit']),
}

const DESCRIBE: Record<keyof typeof RUNNERS, string> = {
    fetchUserStats: 'Aggregate trade volume, counts, points, and USD volume per user',
    fetchIndexerStatus: 'Latest indexed block and lag per chain from the indexer',
    fetchAllReferralBindings: 'Every referee and referrer pair, oldest binding first',
    fetchReferralBindings: 'Referees bound to a referrer, oldest binding first',
    fetchReferralRewards: 'Referral points and referred trader breakdown for a referrer',
    fetchIncentives: 'V3 staker incentives with reward token, pool, window, and refund state',
    fetchDepositsByOwner: 'V3 staker deposits held by an owner on a chain, with position token id',
    fetchLaunchTokens: 'Launchpad tokens, filtered by chain, launchpad, creator, or graduation',
    fetchTokenSnapshots: 'Per-token market cap, price, fee, and holder snapshots',
    fetchTokenHolders: 'Launch token holders and balances from the indexer',
    fetchRecentSwaps: 'Latest bonding curve swaps on a chain, newest first, with token metadata',
    fetchUserPositions: 'V3 positions held by an owner, with range, liquidity, and fees owed',
    fetchPositionsByTokenIds: 'V3 positions on a chain looked up by NFT token id',
    fetchPoolMetrics: 'Pools with token metadata, price, TVL, 1d and 30d volume, and fee APR',
    fetchNativeUsdPrice: 'Current native token price in USD on a chain, from the indexer',
    fetchNativeUsdPriceSnapshots: 'Native USD price history, oldest first; --limit keeps newest n',
    fetchUserBondingCurveSwaps: 'Bonding curve swaps sent by an address on a chain, newest first',
    fetchUserV3Swaps: 'V3 swaps sent by an address on a chain, newest first',
    fetchUserV2Swaps: 'V2 swaps sent by an address on a chain, newest first',
    fetchUserAggSwaps: 'Aggregate router swaps sent by an address on a chain, newest first',
    fetchUserTransfers: 'Token transfers into or out of an address on a chain, newest first',
    fetchTokenBondingCurveSwaps: 'Paged bonding curve swaps for a token, newest first, with count',
    fetchTokenV3Swaps: 'Paged V3 swaps for a token, newest first, with total count',
    fetchBondingCurveHistory: 'Every bonding curve swap for a token, oldest first, with reserves',
    fetchV3History: 'Every V3 swap for a token, oldest first, with tick and sqrt price',
    fetchTokenCandles: 'OHLC candles for a token on one source and bucket size, oldest first',
    fetchBondingCurvePricesSince: 'Bonding curve prices for a token since a time, oldest first',
    fetchV3PricesSince: 'V3 price points for a token since a time, oldest first',
    fetchPoolPriceHistory: 'Sqrt price points for one V3 pool since a time, oldest first',
    fetchPoolPriceAnchor: 'Last V3 pool price point at or before a time, for anchoring a change',
    fetchV3Pools: 'V3 pools on a chain with their token pair, fee tier, and tick spacing',
    fetchV3Tokens: 'Tokens seen in V3 pools on a chain, with symbol, name, and decimals',
    fetchV3TokenSnapshots: 'Latest USD price per V3 token on a chain, from the indexer',
}

export const COMMANDS: Record<string, Command> = Object.fromEntries(
    Object.entries(RUNNERS).map(([name, runner]) => [
        name,
        { ...runner, describe: DESCRIBE[name as keyof typeof RUNNERS] },
    ])
)

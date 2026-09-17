import {
    fetchAllReferralBindings,
    fetchBondingCurveHistory,
    fetchBondingCurvePricesSince,
    fetchDepositsByOwner,
    fetchIncentives,
    fetchIndexerStatus,
    fetchLaunchTokens,
    fetchNativeUsdPrice,
    fetchNativeUsdPriceSnapshots,
    fetchPoolMetrics,
    fetchPoolPriceAnchor,
    fetchPoolPriceHistory,
    fetchPositions,
    fetchPositionsByTokenIds,
    fetchRecentSwaps,
    fetchReferralBindings,
    fetchReferralRewards,
    fetchTokenBondingCurveSwaps,
    fetchTokenCandles,
    fetchTokenHolders,
    fetchTokenSnapshots,
    fetchTokenV3Swaps,
    fetchUserAggSwaps,
    fetchUserBondingCurveSwaps,
    fetchUserPositions,
    fetchUserStats,
    fetchUserTransfers,
    fetchUserV2Swaps,
    fetchUserV3Swaps,
    fetchV3History,
    fetchV3Pools,
    fetchV3PricesSince,
    fetchV3TokenSnapshots,
    fetchV3Tokens,
} from '@coshi190/juno-moneta-sdk'
import { createPublicClient, http, type Abi, type Address } from 'viem'
import { createPonderClient } from './ponder-client.js'
import {
    optionalAddress,
    optionalAddressList,
    optionalChainId,
    optionalFlag,
    optionalLimit,
    optionalName,
    optionalNonNegativeInt,
    optionalNumber,
    optionalOrder,
    parseAddress,
    parseAddressList,
    parseChainId,
    parseEnum,
    parseFields,
    parseInteger,
    parsePonderUrl,
    parseRpcUrl,
    parseTime,
    parseTokenIds,
} from './args.js'

interface ContractCall {
    address: Address
    abi: Abi
    functionName: string
    args: readonly unknown[]
    value?: bigint
}

interface ReadClient {
    multicall(args: { contracts: readonly ContractCall[]; allowFailure: true }): Promise<unknown>
    readContract(args: ContractCall): Promise<unknown>
}

interface SimulateClient extends ReadClient {
    simulateContract(args: ContractCall & { account?: Address }): Promise<{ result: unknown }>
}

function createReadClient(rpcUrl: string): SimulateClient {
    return createPublicClient({ transport: http(rpcUrl) }) as unknown as SimulateClient
}

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
    rpcUrl: { type: 'string' },
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
    dexId: { type: 'string' },
    fullRangeTolerance: { type: 'string' },
    simulate: { type: 'boolean', default: false },
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

const CHAIN_FLAG = '--chainId <id|slug>'
const OPTIONAL_CHAIN_FLAG = '[--chainId <id|slug>]'
const PONDER_FLAG = '[--ponderUrl <url=$JUNO_MONETA_PONDER_URL>]'
const RPC_FLAG = '[--rpcUrl <url=$JUNO_MONETA_RPC_URL>]'
const SINCE_FLAG = '--since <unix|30m|24h|7d>'
const PAGE_FLAGS = '[--limit <n=50>] [--offset <n=0>]'
const ACTIVITY_FLAGS = `${CHAIN_FLAG} --sender <addr> [--limit <n=50>] [--after <cursor>] ${PONDER_FLAG}`

const DEFAULT_ACTIVITY_LIMIT = 50
const CANDLE_SOURCES = ['bc', 'v3'] as const

function ponder(args: CommandArgs) {
    return createPonderClient(parsePonderUrl(args.ponderUrl))
}

function activityArgs(args: CommandArgs) {
    return {
        chainId: parseChainId(args.chainId),
        sender: parseAddress(args.sender, 'sender'),
        limit: optionalLimit(args.limit) ?? DEFAULT_ACTIVITY_LIMIT,
        after: args.after,
    }
}

interface LaunchToken {
    tokenAddr: string
    chainId: number
    launchpadId: string
    creator: string
    name: string | null
    symbol: string | null
    logo: string | null
    description: string | null
    link1: string | null
    link2: string | null
    link3: string | null
    createdTime: number
    market: string | null
    isGraduated: number | null
    graduatedAt: number | null
    ammPool: string | null
    graduationTarget: number | null
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
    launchpadId: string
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
    'launchpadId',
    'market',
    'isGraduated',
    'graduatedAt',
    'ammPool',
    'graduationTarget',
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
    fetchUserStats: {
        flags: `${CHAIN_FLAG} --users <addr,addr> ${PONDER_FLAG}`,
        describe:
            'Aggregate trade volume, counts, points, and USD volume per user from the indexer',
        run: async (args) => {
            const chainId = parseChainId(args.chainId)
            const users = parseAddressList(args.users, 'users')
            const client = ponder(args)
            const nativeUsdPrice = await fetchNativeUsdPrice(client, { chainId })
            return fetchUserStats(client, { chainId, users, nativeUsdPrice })
        },
    },
    fetchIndexerStatus: {
        flags: PONDER_FLAG,
        describe: 'Latest indexed block and lag per chain from the indexer',
        run: (args) => fetchIndexerStatus(ponder(args)),
    },
    fetchAllReferralBindings: {
        flags: PONDER_FLAG,
        describe: 'Every referee and referrer pair from the indexer, oldest binding first',
        run: (args) => fetchAllReferralBindings(ponder(args)),
    },
    fetchReferralBindings: {
        flags: `--referrer <addr> ${PONDER_FLAG}`,
        describe: 'Referees bound to a referrer, oldest binding first',
        run: (args) =>
            fetchReferralBindings(ponder(args), {
                referrer: parseAddress(args.referrer, 'referrer'),
            }),
    },
    fetchReferralRewards: {
        flags: `${CHAIN_FLAG} --referrer <addr> ${PONDER_FLAG}`,
        describe: 'Referral points and referred trader breakdown for a referrer',
        run: async (args) => {
            const chainId = parseChainId(args.chainId)
            const referrer = parseAddress(args.referrer, 'referrer')
            const client = ponder(args)
            const nativeUsdPrice = await fetchNativeUsdPrice(client, { chainId })
            return fetchReferralRewards(client, { chainId, referrer, nativeUsdPrice })
        },
    },
    fetchIncentives: {
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe:
            'V3 staker incentives on a chain, with reward token, pool, window, and refund state',
        run: (args) =>
            fetchIncentives(ponder(args), {
                chainId: parseChainId(args.chainId),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchDepositsByOwner: {
        flags: `${CHAIN_FLAG} --owner <addr> [--limit <n>] ${PONDER_FLAG}`,
        describe: 'V3 staker deposits held by an owner on a chain, with position token id',
        run: (args) =>
            fetchDepositsByOwner(ponder(args), {
                chainId: parseChainId(args.chainId),
                owner: parseAddress(args.owner, 'owner'),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchLaunchTokens: {
        flags: `${OPTIONAL_CHAIN_FLAG} [--launchpadId <id>] [--creator <addr>] [--isGraduated 0|1] [--tokenAddrs <a,a>] ${selectFlags(LAUNCH_TOKEN_PRESETS)} ${PONDER_FLAG}`,
        describe:
            'Launchpad tokens from the indexer, filtered by chain, launchpad, creator, or graduation',
        run: (args) =>
            fetchLaunchTokens(
                ponder(args),
                {
                    chainId: optionalChainId(args.chainId),
                    launchpadId: optionalName(args.launchpadId, 'launchpadId'),
                    creator: optionalAddress(args.creator),
                    isGraduated: optionalFlag(args.isGraduated, 'isGraduated'),
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
        flags: `${OPTIONAL_CHAIN_FLAG} [--launchpadId <id>] [--tokenAddrs <a,a>] ${selectFlags(TOKEN_SNAPSHOT_PRESETS)} ${PONDER_FLAG}`,
        describe:
            'Per-token market cap, price, fee, and holder snapshots from the indexer, filtered by chain or launchpad',
        run: (args) =>
            fetchTokenSnapshots(
                ponder(args),
                {
                    chainId: optionalChainId(args.chainId),
                    launchpadId: optionalName(args.launchpadId, 'launchpadId'),
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
        flags: `${OPTIONAL_CHAIN_FLAG} [--tokenAddr <addr>] [--address <holder>] ${selectFlags(TOKEN_HOLDER_PRESETS)} ${PONDER_FLAG}`,
        describe: 'Launch token holders and balances from the indexer',
        run: (args) =>
            fetchTokenHolders(
                ponder(args),
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
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe: 'Latest bonding curve swaps on a chain, newest first, with token metadata',
        run: (args) =>
            fetchRecentSwaps(ponder(args), {
                chainId: parseChainId(args.chainId),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchUserPositions: {
        flags: `${CHAIN_FLAG} --owner <addr> [--limit <n>] ${PONDER_FLAG}`,
        describe: 'V3 positions held by an owner on a chain, with range, liquidity, and fees owed',
        run: (args) =>
            fetchUserPositions(ponder(args), {
                chainId: parseChainId(args.chainId),
                owner: parseAddress(args.owner, 'owner'),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchPositionsByTokenIds: {
        flags: `${CHAIN_FLAG} --tokenIds <id,id> [--limit <n>] ${PONDER_FLAG}`,
        describe: 'V3 positions on a chain looked up by NFT token id',
        run: (args) =>
            fetchPositionsByTokenIds(ponder(args), {
                chainId: parseChainId(args.chainId),
                tokenIds: parseTokenIds(args.tokenIds),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchPoolMetrics: {
        flags: `${CHAIN_FLAG} [--protocol <name=junoswap>] [--limit <n>] ${PONDER_FLAG}`,
        describe:
            'Pools on a chain with token metadata, price, TVL, 1d and 30d volume, and fee APR',
        run: (args) =>
            fetchPoolMetrics(ponder(args), {
                chainId: parseChainId(args.chainId),
                protocol: optionalName(args.protocol, 'protocol'),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchNativeUsdPrice: {
        flags: `${CHAIN_FLAG} ${PONDER_FLAG}`,
        describe: 'Current native token price in USD on a chain, from the indexer',
        run: (args) =>
            fetchNativeUsdPrice(ponder(args), {
                chainId: parseChainId(args.chainId),
            }),
    },
    fetchNativeUsdPriceSnapshots: {
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe:
            'Native token USD price history on a chain, oldest first, --limit keeps the newest n',
        run: async (args) => {
            const rows = await fetchNativeUsdPriceSnapshots(ponder(args), {
                chainId: parseChainId(args.chainId),
            })
            const limit = optionalLimit(args.limit)
            return limit === undefined ? rows : rows.slice(-limit)
        },
    },
    fetchUserBondingCurveSwaps: {
        flags: ACTIVITY_FLAGS,
        describe: 'Bonding curve swaps sent by an address on a chain, newest first',
        run: (args) => fetchUserBondingCurveSwaps(ponder(args), activityArgs(args)),
    },
    fetchUserV3Swaps: {
        flags: ACTIVITY_FLAGS,
        describe: 'V3 swaps sent by an address on a chain, newest first',
        run: (args) => fetchUserV3Swaps(ponder(args), activityArgs(args)),
    },
    fetchUserV2Swaps: {
        flags: ACTIVITY_FLAGS,
        describe: 'V2 swaps sent by an address on a chain, newest first',
        run: (args) => fetchUserV2Swaps(ponder(args), activityArgs(args)),
    },
    fetchUserAggSwaps: {
        flags: ACTIVITY_FLAGS,
        describe: 'Aggregate router swaps sent by an address on a chain, newest first',
        run: (args) => fetchUserAggSwaps(ponder(args), activityArgs(args)),
    },
    fetchUserTransfers: {
        flags: `${CHAIN_FLAG} --sender <addr> [--limit <n=50>] ${PONDER_FLAG}`,
        describe: 'Token transfers into or out of an address on a chain, newest first',
        run: (args) => fetchUserTransfers(ponder(args), activityArgs(args)),
    },
    fetchTokenBondingCurveSwaps: {
        flags: `--tokenAddr <addr> ${PAGE_FLAGS} [--isBuy 0|1] [--sender <addr>] ${PONDER_FLAG}`,
        describe: 'One page of bonding curve swaps for a token, newest first, with total count',
        run: (args) =>
            fetchTokenBondingCurveSwaps(ponder(args), {
                tokenAddr: parseAddress(args.tokenAddr, 'tokenAddr'),
                limit: optionalLimit(args.limit) ?? DEFAULT_ACTIVITY_LIMIT,
                offset: optionalNonNegativeInt(args.offset, 'offset') ?? 0,
                isBuy: optionalFlag(args.isBuy, 'isBuy'),
                sender: optionalAddress(args.sender),
            }),
    },
    fetchTokenV3Swaps: {
        flags: `${CHAIN_FLAG} --tokenAddr <addr> ${PAGE_FLAGS} [--txFrom <addr>] [--poolAddress <addr>] ${PONDER_FLAG}`,
        describe: 'One page of V3 swaps for a token, newest first, with total count',
        run: (args) =>
            fetchTokenV3Swaps(ponder(args), {
                chainId: parseChainId(args.chainId),
                tokenAddr: parseAddress(args.tokenAddr, 'tokenAddr'),
                limit: optionalLimit(args.limit) ?? DEFAULT_ACTIVITY_LIMIT,
                offset: optionalNonNegativeInt(args.offset, 'offset') ?? 0,
                txFrom: optionalAddress(args.txFrom),
                poolAddress: optionalAddress(args.poolAddress),
            }),
    },
    fetchBondingCurveHistory: {
        flags: `--tokenAddr <addr> ${PONDER_FLAG}`,
        describe: 'Every bonding curve swap for a token, oldest first, with reserves',
        run: (args) =>
            fetchBondingCurveHistory(ponder(args), {
                tokenAddr: parseAddress(args.tokenAddr, 'tokenAddr'),
            }),
    },
    fetchV3History: {
        flags: `${CHAIN_FLAG} --tokenAddr <addr> [--poolAddress <addr>] ${PONDER_FLAG}`,
        describe: 'Every V3 swap for a token, oldest first, with tick and sqrt price',
        run: (args) =>
            fetchV3History(ponder(args), {
                chainId: parseChainId(args.chainId),
                tokenAddr: parseAddress(args.tokenAddr, 'tokenAddr'),
                poolAddress: optionalAddress(args.poolAddress),
            }),
    },
    fetchTokenCandles: {
        flags: `${CHAIN_FLAG} --tokenAddr <addr> --source bc|v3 --duration <60|300|900|3600|14400|86400> ${SINCE_FLAG} ${PONDER_FLAG}`,
        describe: 'OHLC candles for a token on one source and bucket size, oldest first',
        run: (args) =>
            fetchTokenCandles(ponder(args), {
                chainId: parseChainId(args.chainId),
                tokenAddr: parseAddress(args.tokenAddr, 'tokenAddr'),
                source: parseEnum(args.source, 'source', CANDLE_SOURCES),
                duration: parseInteger(args.duration, 'duration'),
                since: parseTime(args.since, 'since'),
            }),
    },
    fetchBondingCurvePricesSince: {
        flags: `--tokenAddr <addr> ${SINCE_FLAG} ${PONDER_FLAG}`,
        describe: 'Bonding curve price points for a token since a time, oldest first',
        run: (args) =>
            fetchBondingCurvePricesSince(ponder(args), {
                tokenAddr: parseAddress(args.tokenAddr, 'tokenAddr'),
                since: parseTime(args.since, 'since'),
            }),
    },
    fetchV3PricesSince: {
        flags: `${CHAIN_FLAG} --tokenAddr <addr> ${SINCE_FLAG} [--poolAddress <addr>] ${PONDER_FLAG}`,
        describe: 'V3 price points for a token since a time, oldest first',
        run: (args) =>
            fetchV3PricesSince(ponder(args), {
                chainId: parseChainId(args.chainId),
                tokenAddr: parseAddress(args.tokenAddr, 'tokenAddr'),
                since: parseTime(args.since, 'since'),
                poolAddress: optionalAddress(args.poolAddress),
            }),
    },
    fetchPoolPriceHistory: {
        flags: `${CHAIN_FLAG} --poolAddress <addr> ${SINCE_FLAG} ${PONDER_FLAG}`,
        describe: 'Sqrt price points for one V3 pool since a time, oldest first',
        run: (args) =>
            fetchPoolPriceHistory(ponder(args), {
                chainId: parseChainId(args.chainId),
                poolAddress: parseAddress(args.poolAddress, 'poolAddress'),
                since: parseTime(args.since, 'since'),
            }),
    },
    fetchPoolPriceAnchor: {
        flags: `${CHAIN_FLAG} --poolAddress <addr> --before <unix|30m|24h|7d> ${PONDER_FLAG}`,
        describe: 'The last V3 pool price point at or before a time, for anchoring a change',
        run: (args) =>
            fetchPoolPriceAnchor(ponder(args), {
                chainId: parseChainId(args.chainId),
                poolAddress: parseAddress(args.poolAddress, 'poolAddress'),
                before: parseTime(args.before, 'before'),
            }),
    },
    fetchV3Pools: {
        flags: `${CHAIN_FLAG} [--protocol <name>] [--addresses <a,a>] [--limit <n=500>] ${PONDER_FLAG}`,
        describe: 'V3 pools on a chain with their token pair, fee tier, and tick spacing',
        run: (args) =>
            fetchV3Pools(ponder(args), {
                chainId: parseChainId(args.chainId),
                protocol: optionalName(args.protocol, 'protocol'),
                addresses: optionalAddressList(args.addresses),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchV3Tokens: {
        flags: `${CHAIN_FLAG} [--limit <n=500>] ${PONDER_FLAG}`,
        describe: 'Tokens seen in V3 pools on a chain, with symbol, name, and decimals',
        run: (args) =>
            fetchV3Tokens(ponder(args), {
                chainId: parseChainId(args.chainId),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchV3TokenSnapshots: {
        flags: `${CHAIN_FLAG} [--limit <n>] ${PONDER_FLAG}`,
        describe: 'Latest USD price per V3 token on a chain, from the indexer',
        run: (args) =>
            fetchV3TokenSnapshots(ponder(args), {
                chainId: parseChainId(args.chainId),
                limit: optionalLimit(args.limit),
            }),
    },
    fetchPositions: {
        flags: `${CHAIN_FLAG} [--owner <addr>] [--tokenIds <id,id>] [--dexId <name>] [--limit <n>] [--fullRangeTolerance <n>] [--simulate] ${PONDER_FLAG} ${RPC_FLAG}`,
        describe:
            'V3 positions resolved against live pool state, with amounts, fees owed, and range, --simulate for exact uncollected fees',
        run: (args) => {
            const chainId = parseChainId(args.chainId)
            const client = createReadClient(parseRpcUrl(args.rpcUrl, chainId))
            return fetchPositions(ponder(args), client, {
                chainId,
                owner: optionalAddress(args.owner),
                tokenIds: args.tokenIds === undefined ? undefined : parseTokenIds(args.tokenIds),
                dexId: optionalName(args.dexId, 'dexId'),
                limit: optionalLimit(args.limit),
                fullRangeTolerance: optionalNumber(args.fullRangeTolerance, 'fullRangeTolerance'),
                simulate: args.simulate ? client : undefined,
            })
        },
    },
}

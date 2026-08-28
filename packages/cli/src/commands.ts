import {
    getChains,
    LAUNCH_TOKEN_CARD_FIELDS,
    LAUNCH_TOKEN_DETAIL_FIELDS,
    LAUNCH_TOKEN_META_FIELDS,
    getStablecoins,
    TOKEN_HOLDER_ADDRESS_FIELDS,
    TOKEN_HOLDER_BALANCE_FIELDS,
    TOKEN_SNAPSHOT_CREATOR_FIELDS,
    TOKEN_SNAPSHOT_HOLDER_COUNT_FIELDS,
    TOKEN_SNAPSHOT_LIST_FIELDS,
    getWrappedNativeAddress,
    createPonderClient,
    fetchAllReferralBindings,
    fetchDepositsByOwner,
    fetchIncentiveAnalytics,
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
    getAggRouterDeployment,
    getBondingCurveDeployment,
    getDexConfig,
    getSupportedDexs,
    type IncentiveMetrics,
    type LaunchToken,
    type TokenHolder,
    type TokenSnapshot,
} from '@coshi190/juno-moneta-sdk'
import {
    optionalAddress,
    optionalAddressList,
    optionalChainId,
    optionalGraduated,
    optionalLimit,
    optionalOrder,
    optionalProtocol,
    optionalProtocolType,
    parseAddress,
    parseAddressList,
    parseChainId,
    parseFields,
    parsePonderUrl,
    parseTokenIds,
} from './args.js'

export interface CommandArgs {
    chainId?: string | undefined
    dexId?: string | undefined
    protocolType?: string | undefined
    protocol?: string | undefined
    users?: string | undefined
    owner?: string | undefined
    tokenIds?: string | undefined
    referrer?: string | undefined
    tokenAddr?: string | undefined
    tokenAddrs?: string | undefined
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

const CHAINS = 'chains'
const DEX = 'dex'
const DEPLOYMENTS = 'deployments'
const PONDER = 'ponder'

const CHAIN_FLAG = '--chainId <id|slug>'
const CONFIG_FLAGS = `${CHAIN_FLAG} [--dexId <dex>] [--protocolType v2|v3]`
const OPTIONAL_CHAIN_FLAG = '[--chainId <id|slug>]'
const SELECT_FLAGS = '[--fields <preset|a,b,c>] [--orderBy <field>] [--orderDirection asc|desc]'
const PONDER_FLAG = '[--ponderUrl <url>]'

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

function chainCommand(group: string, describe: string, fn: (chainId: number) => unknown): Command {
    return {
        group,
        flags: CHAIN_FLAG,
        describe,
        run: (args) => fn(parseChainId(args.chainId)),
    }
}

function toTableRow(program: IncentiveMetrics) {
    return {
        status: program.status,
        pair: program.poolLabel,
        symbol: program.rewardSymbol,
        reward: program.reward,
        perDay: program.rewardPerDay,
        usdPerDay: program.rewardUsdPerDay,
        progress: program.progressPercent,
        daysLeft: program.remainingDays,
        tvlUsd: program.poolTvlUsd,
        apr: program.rewardAprPoolTvlPercent,
        feeApr: program.feeAprPercent,
    }
}

function constantCommand(group: string, describe: string, value: unknown): Command {
    return { group, flags: '', describe, run: () => value }
}

export const COMMANDS: Record<string, Command> = {
    getChains: constantCommand(CHAINS, 'Chain slug to chain id', getChains()),
    getWrappedNativeAddress: chainCommand(
        CHAINS,
        'Wrapped native token address for a chain',
        getWrappedNativeAddress
    ),
    getStablecoins: chainCommand(CHAINS, 'Stablecoin addresses for a chain', getStablecoins),

    getDexConfig: {
        group: DEX,
        flags: CONFIG_FLAGS,
        describe: 'Config for a chain and dex, at --protocolType or the dex default',
        run: (args) =>
            getDexConfig(
                parseChainId(args.chainId),
                args.dexId,
                optionalProtocolType(args.protocolType)
            ),
    },
    getSupportedDexs: {
        group: DEX,
        flags: `${CHAIN_FLAG} [--protocolType v2|v3]`,
        describe: 'Dex ids with an enabled protocol on a chain',
        run: (args) =>
            getSupportedDexs(parseChainId(args.chainId), optionalProtocolType(args.protocolType)),
    },

    getBondingCurveDeployment: chainCommand(
        DEPLOYMENTS,
        'Bonding curve address and start block for a chain',
        getBondingCurveDeployment
    ),
    getAggRouterDeployment: chainCommand(
        DEPLOYMENTS,
        'Aggregator router address and start block for a chain',
        getAggRouterDeployment
    ),

    fetchUserStats: {
        group: PONDER,
        flags: `${CHAIN_FLAG} --users <addr,addr> [--ponderUrl <url>]`,
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
        flags: '[--ponderUrl <url>]',
        describe: 'Latest indexed block and lag per chain from the indexer',
        run: (args) => fetchIndexerStatus(createPonderClient(parsePonderUrl(args.ponderUrl))),
    },
    fetchAllReferralBindings: {
        group: PONDER,
        flags: '[--ponderUrl <url>]',
        describe: 'Every referee and referrer pair from the indexer, oldest binding first',
        run: (args) => fetchAllReferralBindings(createPonderClient(parsePonderUrl(args.ponderUrl))),
    },
    fetchReferralBindings: {
        group: PONDER,
        flags: '--referrer <addr> [--ponderUrl <url>]',
        describe: 'Referees bound to a referrer, oldest binding first',
        run: (args) =>
            fetchReferralBindings(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                referrer: parseAddress(args.referrer, 'referrer'),
            }),
    },
    fetchReferralRewards: {
        group: PONDER,
        flags: `${CHAIN_FLAG} --referrer <addr> [--ponderUrl <url>]`,
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
        flags: `${CHAIN_FLAG} [--limit <n>] [--ponderUrl <url>]`,
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
        flags: `${OPTIONAL_CHAIN_FLAG} [--creator <addr>] [--isGraduated 0|1] [--tokenAddrs <a,a>] ${SELECT_FLAGS} ${PONDER_FLAG}`,
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
        flags: `${OPTIONAL_CHAIN_FLAG} [--tokenAddrs <a,a>] ${SELECT_FLAGS} ${PONDER_FLAG}`,
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
        flags: `${OPTIONAL_CHAIN_FLAG} [--tokenAddr <addr>] [--address <addr>] ${SELECT_FLAGS} ${PONDER_FLAG}`,
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
        flags: `${CHAIN_FLAG} --owner <addr> [--limit <n>] [--ponderUrl <url>]`,
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
        flags: `${CHAIN_FLAG} --tokenIds <id,id> [--limit <n>] [--ponderUrl <url>]`,
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
        flags: `${CHAIN_FLAG} [--protocol <name>] [--limit <n>] [--ponderUrl <url>]`,
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

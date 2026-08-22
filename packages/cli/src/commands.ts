import {
    AGG_ROUTER_DEPLOYMENTS,
    BONDING_CURVE_ADDRESS_BY_CHAIN,
    BONDING_CURVE_DEPLOYMENTS,
    BONDING_CURVE_JUNOSWAP_CHAIN_ID,
    CHAIN_IDS,
    DEFAULT_FEE_TIER,
    FEE_TIERS,
    LAUNCHPAD_CHAIN_IDS,
    LAUNCH_TOKEN_CARD_FIELDS,
    LAUNCH_TOKEN_DETAIL_FIELDS,
    LAUNCH_TOKEN_META_FIELDS,
    ProtocolType,
    STABLECOIN_ADDRESSES,
    TOKEN_HOLDER_ADDRESS_FIELDS,
    TOKEN_HOLDER_BALANCE_FIELDS,
    TOKEN_SNAPSHOT_CREATOR_FIELDS,
    TOKEN_SNAPSHOT_HOLDER_COUNT_FIELDS,
    TOKEN_SNAPSHOT_LIST_FIELDS,
    V3_STAKER_START_BLOCKS,
    WRAPPED_NATIVE_ADDRESSES,
    createPonderClient,
    fetchAllReferralBindings,
    fetchIncentives,
    fetchIndexerStatus,
    fetchLaunchTokens,
    fetchNativeUsdPrice,
    fetchPoolMetrics,
    fetchPositionsByTokenIds,
    fetchRecentSwaps,
    fetchReferralBindings,
    fetchReferralRewards,
    fetchTokenHolders,
    fetchTokenSnapshots,
    fetchUserStats,
    fetchUserPositions,
    getAggRouterAddress,
    getBondingCurveAddress,
    getDefaultDexForChain,
    getDexConfig,
    getDexsByProtocol,
    getProtocolSpender,
    getSupportedDexs,
    getV2Config,
    getV3Config,
    getV3StakerAddress,
    isAggRouterChain,
    isLaunchpadChain,
    isV2Config,
    isV3Config,
    type DEXType,
    type LaunchToken,
    type ProtocolConfig,
    type TokenHolder,
    type TokenSnapshot,
} from '@coshi190/junoswap-sdk'
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
    parseProtocolType,
    parseTokenIds,
    resolveProtocolConfig,
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
}

export interface Command {
    group: string
    flags: string
    describe: string
    run: (args: CommandArgs) => unknown
}

const CHAINS = 'chains'
const DEX = 'dex-config'
const DEPLOYMENTS = 'deployments'
const PONDER = 'ponder'

const CHAIN_FLAG = '--chainId <id|slug>'
const CHAIN_DEX_FLAGS = `${CHAIN_FLAG} [--dexId <dex>]`
const CONFIG_FLAGS = `${CHAIN_DEX_FLAGS} [--protocolType v2|v3]`
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

function chainDexCommand(
    group: string,
    describe: string,
    fn: (chainId: number, dexId?: DEXType) => unknown
): Command {
    return {
        group,
        flags: CHAIN_DEX_FLAGS,
        describe,
        run: (args) => fn(parseChainId(args.chainId), args.dexId),
    }
}

function configCommand(
    group: string,
    describe: string,
    fn: (config: ProtocolConfig) => unknown
): Command {
    return {
        group,
        flags: CONFIG_FLAGS,
        describe,
        run: (args) =>
            fn(
                resolveProtocolConfig(
                    parseChainId(args.chainId),
                    args.dexId,
                    optionalProtocolType(args.protocolType)
                )
            ),
    }
}

function constantCommand(group: string, describe: string, value: unknown): Command {
    return { group, flags: '', describe, run: () => value }
}

export const COMMANDS: Record<string, Command> = {
    CHAIN_IDS: constantCommand(CHAINS, 'Chain slug to chain id', CHAIN_IDS),
    WRAPPED_NATIVE_ADDRESSES: constantCommand(
        CHAINS,
        'Wrapped native token address per chain id',
        WRAPPED_NATIVE_ADDRESSES
    ),
    STABLECOIN_ADDRESSES: constantCommand(
        CHAINS,
        'Stablecoin addresses per chain id',
        STABLECOIN_ADDRESSES
    ),

    getV3Config: chainDexCommand(
        DEX,
        'V3 config for a chain and dex, enabled ones only',
        getV3Config
    ),
    getV2Config: chainDexCommand(
        DEX,
        'V2 config for a chain and dex, enabled ones only',
        getV2Config
    ),
    getV3StakerAddress: chainDexCommand(
        DEX,
        'V3 staker address for a chain and dex',
        getV3StakerAddress
    ),
    getDexConfig: chainDexCommand(
        DEX,
        "Config for the dex's default protocol, without the enabled check",
        getDexConfig
    ),
    getDexsByProtocol: {
        group: DEX,
        flags: `${CHAIN_FLAG} --protocolType v2|v3`,
        describe: 'Dex ids on a chain supporting a protocol, by priority',
        run: (args) =>
            getDexsByProtocol(parseChainId(args.chainId), parseProtocolType(args.protocolType)),
    },
    getSupportedDexs: chainCommand(
        DEX,
        'Dex ids with any enabled protocol on a chain, by priority',
        getSupportedDexs
    ),
    isV2Config: configCommand(DEX, 'Whether the resolved config is a V2 config', isV2Config),
    isV3Config: configCommand(DEX, 'Whether the resolved config is a V3 config', isV3Config),
    getProtocolSpender: configCommand(
        DEX,
        'Router for V2 or swap router for V3 of the resolved config',
        getProtocolSpender
    ),
    getDefaultDexForChain: chainCommand(DEX, 'Default dex id for a chain', getDefaultDexForChain),
    FEE_TIERS: constantCommand(DEX, 'Named V3 fee tiers', FEE_TIERS),
    DEFAULT_FEE_TIER: constantCommand(DEX, 'Fee tier used when none is given', DEFAULT_FEE_TIER),
    ProtocolType: constantCommand(DEX, 'Protocol type enum values', ProtocolType),

    getBondingCurveAddress: chainCommand(
        DEPLOYMENTS,
        'Bonding curve address for a chain',
        getBondingCurveAddress
    ),
    isLaunchpadChain: chainCommand(
        DEPLOYMENTS,
        'Whether a chain has a bonding curve deployed',
        isLaunchpadChain
    ),
    getAggRouterAddress: chainCommand(
        DEPLOYMENTS,
        'Aggregator router address for a chain',
        getAggRouterAddress
    ),
    isAggRouterChain: chainCommand(
        DEPLOYMENTS,
        'Whether a chain has an aggregator router deployed',
        isAggRouterChain
    ),
    BONDING_CURVE_DEPLOYMENTS: constantCommand(
        DEPLOYMENTS,
        'Bonding curve address and start block per chain id',
        BONDING_CURVE_DEPLOYMENTS
    ),
    AGG_ROUTER_DEPLOYMENTS: constantCommand(
        DEPLOYMENTS,
        'Aggregator router address and start block per chain id',
        AGG_ROUTER_DEPLOYMENTS
    ),
    V3_STAKER_START_BLOCKS: constantCommand(
        DEPLOYMENTS,
        'V3 staker indexing start block per chain id',
        V3_STAKER_START_BLOCKS
    ),
    BONDING_CURVE_JUNOSWAP_CHAIN_ID: constantCommand(
        DEPLOYMENTS,
        'Chain id of the canonical Junoswap bonding curve',
        BONDING_CURVE_JUNOSWAP_CHAIN_ID
    ),
    LAUNCHPAD_CHAIN_IDS: constantCommand(
        DEPLOYMENTS,
        'Chain ids with a bonding curve deployed',
        LAUNCHPAD_CHAIN_IDS
    ),
    BONDING_CURVE_ADDRESS_BY_CHAIN: constantCommand(
        DEPLOYMENTS,
        'Lowercased bonding curve address per chain id',
        BONDING_CURVE_ADDRESS_BY_CHAIN
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
}

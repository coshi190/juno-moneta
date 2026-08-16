import {
    AGG_ROUTER_DEPLOYMENTS,
    BONDING_CURVE_ADDRESS_BY_CHAIN,
    BONDING_CURVE_DEPLOYMENTS,
    BONDING_CURVE_JUNOSWAP_CHAIN_ID,
    CHAIN_IDS,
    DEFAULT_FEE_TIER,
    FEE_TIERS,
    LAUNCHPAD_CHAIN_IDS,
    ProtocolType,
    STABLECOIN_ADDRESSES,
    V3_STAKER_START_BLOCKS,
    WRAPPED_NATIVE_ADDRESSES,
    createPonderClient,
    fetchUserStats,
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
    type ProtocolConfig,
} from '@coshi190/junoswap-sdk'
import {
    optionalProtocolType,
    parseAddressList,
    parseChainId,
    parsePonderUrl,
    parseProtocolType,
    resolveProtocolConfig,
} from './args.js'

export interface CommandArgs {
    chainId?: string | undefined
    dexId?: string | undefined
    protocolType?: string | undefined
    users?: string | undefined
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
        describe: 'Aggregate trade volume and counts per user from the indexer',
        run: (args) => {
            const chainId = parseChainId(args.chainId)
            const users = parseAddressList(args.users, 'users')
            return fetchUserStats(createPonderClient(parsePonderUrl(args.ponderUrl)), {
                chainId,
                users,
            })
        },
    },
}

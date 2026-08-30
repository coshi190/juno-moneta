import { createConfig, factory } from 'ponder'
import {
    ProtocolType,
    getDexConfig,
    AGG_ROUTER_JUNOSWAP_ABI,
    BONDING_CURVE_JUNOSWAP_ABI,
    getCurveCreationEvent,
    getChains,
    ERC20_ABI,
    NONFUNGIBLE_POSITION_MANAGER_ABI,
    UNISWAP_V2_FACTORY_ABI,
    UNISWAP_V2_PAIR_ABI,
    UNISWAP_V3_FACTORY_ABI,
    UNISWAP_V3_POOL_ABI,
    UNISWAP_V3_STAKER_ABI,
    getAggRouterDeployment,
    getBondingCurveDeployment,
} from '@coshi190/juno-moneta-sdk'
import externalPools from './external-pools.json'

const CHAINS = getChains()

const DEFAULT_RPC_URLS: Record<number, string> = {
    [CHAINS.kubTestnet]: 'https://rpc-testnet.bitkubchain.io',
    [CHAINS.bitkub]: 'https://rpc.bitkubchain.io',
    [CHAINS.jbc]: 'https://rpc-l1.jibchain.net',
}

const seed = (dex: keyof typeof externalPools) =>
    (externalPools[dex] as Array<{ pair?: string; pool?: string }>).map(
        (p) => (p.pair ?? p.pool) as `0x${string}`
    )

function v2Factory(chainId: number, dexId: string): `0x${string}` {
    const factoryAddress = getDexConfig(chainId, dexId, ProtocolType.V2)?.factory
    if (!factoryAddress) throw new Error(`No enabled V2 config for ${dexId} on chain ${chainId}`)
    return factoryAddress
}

function v3Factory(chainId: number, dexId: string): `0x${string}` {
    const factoryAddress = getDexConfig(chainId, dexId, ProtocolType.V3)?.factory
    if (!factoryAddress) throw new Error(`No enabled V3 config for ${dexId} on chain ${chainId}`)
    return factoryAddress
}

function v3PositionManager(chainId: number, dexId: string): `0x${string}` {
    const address = getDexConfig(chainId, dexId, ProtocolType.V3)?.positionManager
    if (!address) throw new Error(`No positionManager for ${dexId} on chain ${chainId}`)
    return address
}

function v3Staker(chainId: number, dexId: string): `0x${string}` {
    const address = getDexConfig(chainId, dexId, ProtocolType.V3)?.staker
    if (!address) throw new Error(`No V3 staker for ${dexId} on chain ${chainId}`)
    return address
}

const abiEvent = <TAbi extends readonly { type: string; name?: string }[], TName extends string>(
    abi: TAbi,
    name: TName
): Extract<TAbi[number], { type: 'event'; name: TName }> => {
    const event = abi.find(
        (e): e is Extract<TAbi[number], { type: 'event'; name: TName }> =>
            e.type === 'event' && e.name === name
    )
    if (!event) throw new Error(`Event ${name} not found in ABI`)
    return event
}

const PAIR_CREATED_EVENT = abiEvent(UNISWAP_V2_FACTORY_ABI, 'PairCreated')
const V3_POOL_CREATED_EVENT = abiEvent(UNISWAP_V3_FACTORY_ABI, 'PoolCreated')
const CURVE_CREATION_EVENT = getCurveCreationEvent()

const BONDING_CURVE_TESTNET = getBondingCurveDeployment(CHAINS.kubTestnet)!
const BONDING_CURVE_BITKUB = getBondingCurveDeployment(CHAINS.bitkub)
const AGG_ROUTER_BITKUB = getAggRouterDeployment(CHAINS.bitkub)!

const V3_TESTNET_START = 23900000
const V3_BITKUB_START = 25000000
const V3_JBC_START = 2900000
const V3_STAKER_TESTNET_START = 25824963
const V3_STAKER_BITKUB_START = 28844994
const V3_STAKER_JBC_START = 4990196
const BITKUB_SWAP_START = AGG_ROUTER_BITKUB.startBlock
const JBC_SWAP_START = 8073843

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
    throw new Error('DATABASE_URL is required — the indexer uses Postgres (PGlite is disabled)')
}

export default createConfig({
    database: { kind: 'postgres', connectionString },
    chains: {
        kubTestnet: {
            id: CHAINS.kubTestnet,
            rpc: process.env.PONDER_RPC_URL_25925 ?? DEFAULT_RPC_URLS[CHAINS.kubTestnet]!,
        },
        bitkub: {
            id: CHAINS.bitkub,
            rpc: process.env.PONDER_RPC_URL_96 ?? DEFAULT_RPC_URLS[CHAINS.bitkub]!,
            ethGetLogsBlockRange: 50_000,
        },
        jbc: {
            id: CHAINS.jbc,
            rpc: process.env.PONDER_RPC_URL_8899 ?? DEFAULT_RPC_URLS[CHAINS.jbc]!,
        },
    },
    contracts: {
        BondingCurveJunoswap: {
            abi: BONDING_CURVE_JUNOSWAP_ABI,
            chain: 'kubTestnet',
            address: BONDING_CURVE_TESTNET.address,
            startBlock: BONDING_CURVE_TESTNET.startBlock,
        },
        LaunchToken: {
            abi: ERC20_ABI,
            chain: 'kubTestnet',
            address: factory({
                address: BONDING_CURVE_TESTNET.address,
                event: CURVE_CREATION_EVENT,
                parameter: 'tokenAddr',
            }),
            startBlock: BONDING_CURVE_TESTNET.startBlock,
        },
        ...(BONDING_CURVE_BITKUB
            ? {
                  BondingCurveJunoswapBitkub: {
                      abi: BONDING_CURVE_JUNOSWAP_ABI,
                      chain: 'bitkub',
                      address: BONDING_CURVE_BITKUB.address,
                      startBlock: BONDING_CURVE_BITKUB.startBlock,
                  },
                  LaunchTokenBitkub: {
                      abi: ERC20_ABI,
                      chain: 'bitkub',
                      address: factory({
                          address: BONDING_CURVE_BITKUB.address,
                          event: CURVE_CREATION_EVENT,
                          parameter: 'tokenAddr',
                      }),
                      startBlock: BONDING_CURVE_BITKUB.startBlock,
                  },
              }
            : {}),
        V3Factory: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'kubTestnet',
            address: v3Factory(CHAINS.kubTestnet, 'junoswap'),
            startBlock: V3_TESTNET_START,
        },
        V3Pool: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'kubTestnet',
            address: factory({
                address: v3Factory(CHAINS.kubTestnet, 'junoswap'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: V3_TESTNET_START,
        },
        V3FactoryBitkub: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'bitkub',
            address: v3Factory(CHAINS.bitkub, 'junoswap'),
            startBlock: V3_BITKUB_START,
        },
        V3PoolBitkub: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'bitkub',
            address: factory({
                address: v3Factory(CHAINS.bitkub, 'junoswap'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: V3_BITKUB_START,
        },
        V3FactoryJbc: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'jbc',
            address: v3Factory(CHAINS.jbc, 'junoswap'),
            startBlock: V3_JBC_START,
        },
        V3PoolJbc: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'jbc',
            address: factory({
                address: v3Factory(CHAINS.jbc, 'junoswap'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: V3_JBC_START,
        },
        NftPositionManager: {
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            chain: 'kubTestnet',
            address: v3PositionManager(CHAINS.kubTestnet, 'junoswap'),
            startBlock: V3_TESTNET_START,
        },
        NftPositionManagerBitkub: {
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            chain: 'bitkub',
            address: v3PositionManager(CHAINS.bitkub, 'junoswap'),
            startBlock: V3_BITKUB_START,
        },
        NftPositionManagerJbc: {
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            chain: 'jbc',
            address: v3PositionManager(CHAINS.jbc, 'junoswap'),
            startBlock: V3_JBC_START,
        },
        V3Staker: {
            abi: UNISWAP_V3_STAKER_ABI,
            chain: 'kubTestnet',
            address: v3Staker(CHAINS.kubTestnet, 'junoswap'),
            startBlock: V3_STAKER_TESTNET_START,
        },
        V3StakerBitkub: {
            abi: UNISWAP_V3_STAKER_ABI,
            chain: 'bitkub',
            address: v3Staker(CHAINS.bitkub, 'junoswap'),
            startBlock: V3_STAKER_BITKUB_START,
        },
        V3StakerJbc: {
            abi: UNISWAP_V3_STAKER_ABI,
            chain: 'jbc',
            address: v3Staker(CHAINS.jbc, 'junoswap'),
            startBlock: V3_STAKER_JBC_START,
        },
        JibswapFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'jbc',
            address: v2Factory(CHAINS.jbc, 'jibswap'),
            startBlock: JBC_SWAP_START,
        },
        JibswapPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'jbc',
            address: seed('jibswap'),
            startBlock: JBC_SWAP_START,
        },
        JibswapPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'jbc',
            address: factory({
                address: v2Factory(CHAINS.jbc, 'jibswap'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: JBC_SWAP_START,
        },
        UdonswapFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'bitkub',
            address: v2Factory(CHAINS.bitkub, 'udonswap'),
            startBlock: BITKUB_SWAP_START,
        },
        UdonswapPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('udonswap'),
            startBlock: BITKUB_SWAP_START,
        },
        UdonswapPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: factory({
                address: v2Factory(CHAINS.bitkub, 'udonswap'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        PonderFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'bitkub',
            address: v2Factory(CHAINS.bitkub, 'ponder'),
            startBlock: BITKUB_SWAP_START,
        },
        PonderPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('ponder'),
            startBlock: BITKUB_SWAP_START,
        },
        PonderPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: factory({
                address: v2Factory(CHAINS.bitkub, 'ponder'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        DiamonFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'bitkub',
            address: v2Factory(CHAINS.bitkub, 'diamon'),
            startBlock: BITKUB_SWAP_START,
        },
        DiamonPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('diamon'),
            startBlock: BITKUB_SWAP_START,
        },
        DiamonPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: factory({
                address: v2Factory(CHAINS.bitkub, 'diamon'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3Factory: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'bitkub',
            address: v3Factory(CHAINS.bitkub, 'kublerx'),
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3PoolSeeded: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'bitkub',
            address: seed('kublerx'),
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3Pool: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'bitkub',
            address: factory({
                address: v3Factory(CHAINS.bitkub, 'kublerx'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        AggRouterJunoswap: {
            abi: AGG_ROUTER_JUNOSWAP_ABI,
            chain: 'bitkub',
            address: AGG_ROUTER_BITKUB.address,
            startBlock: AGG_ROUTER_BITKUB.startBlock,
        },
    },
})

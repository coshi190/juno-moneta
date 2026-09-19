import { createConfig, factory } from 'ponder'
import type { Abi } from 'viem'
import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'
import { getAggRouterDeployment, getChains } from './src/config.js'
import { CONTRACT_NAMES } from './src/launchpads/index.js'
import { LAUNCHPADS } from './src/launchpads/registry.js'
import { V3_STAKER_ABI } from './src/abis/v3-staker.js'
import { V2_PAIR_ABI } from './src/abis/v2-pair.js'
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
    const factoryAddress = getDexes(chainId, 'v2').find((dex) => dex.dexId === dexId)?.factory
    if (!factoryAddress) throw new Error(`No enabled V2 config for ${dexId} on chain ${chainId}`)
    return factoryAddress
}

function v3Factory(chainId: number, dexId: string): `0x${string}` {
    const factoryAddress = getDexes(chainId, 'v3').find((dex) => dex.dexId === dexId)?.factory
    if (!factoryAddress) throw new Error(`No enabled V3 config for ${dexId} on chain ${chainId}`)
    return factoryAddress
}

function v3PositionManager(chainId: number, dexId: string): `0x${string}` {
    const address = getDexes(chainId, 'v3').find((dex) => dex.dexId === dexId)?.positionManager
    if (!address) throw new Error(`No positionManager for ${dexId} on chain ${chainId}`)
    return address
}

function v3Staker(chainId: number, dexId: string): `0x${string}` {
    const address = getDexes(chainId, 'v3').find((dex) => dex.dexId === dexId)?.staker
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

const PAIR_CREATED_EVENT = abiEvent(getAbi('v2Factory'), 'PairCreated')
const DURIANFUN_TOKEN_CREATED = abiEvent(
    LAUNCHPADS.durianfun.bitkub.abi,
    LAUNCHPADS.durianfun.bitkub.creationEvent.name
)
const V3_POOL_CREATED_EVENT = abiEvent(getAbi('v3Factory'), 'PoolCreated')
const AGG_ROUTER_BITKUB = getAggRouterDeployment(CHAINS.bitkub)!

interface Entry<TAbi extends Abi> {
    address: `0x${string}` | readonly `0x${string}`[]
    startBlock: number
    abi: TAbi
}

function curveContract<TSlug extends keyof typeof CHAINS, TAbi extends Abi>(
    chainSlug: TSlug,
    entry: Entry<TAbi>
) {
    return {
        abi: entry.abi,
        chain: chainSlug,
        address: entry.address,
        startBlock: entry.startBlock,
    }
}

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
        [CONTRACT_NAMES['junoswap:kubTestnet'].curve]: curveContract(
            'kubTestnet',
            LAUNCHPADS.junoswap.kubTestnet
        ),
        [CONTRACT_NAMES['junoswap:kubTestnet'].token]: {
            abi: getAbi('erc20'),
            chain: 'kubTestnet',
            address: factory({
                address: LAUNCHPADS.junoswap.kubTestnet.address,
                event: abiEvent(
                    LAUNCHPADS.junoswap.kubTestnet.abi,
                    LAUNCHPADS.junoswap.kubTestnet.creationEvent.name
                ),
                parameter: LAUNCHPADS.junoswap.kubTestnet.creationEvent.tokenParam,
            }),
            startBlock: LAUNCHPADS.junoswap.kubTestnet.startBlock,
        },
        [CONTRACT_NAMES['junoswap:bitkub'].curve]: curveContract(
            'bitkub',
            LAUNCHPADS.junoswap.bitkub
        ),
        [CONTRACT_NAMES['junoswap:bitkub'].token]: {
            abi: getAbi('erc20'),
            chain: 'bitkub',
            address: factory({
                address: LAUNCHPADS.junoswap.bitkub.address,
                event: abiEvent(
                    LAUNCHPADS.junoswap.bitkub.abi,
                    LAUNCHPADS.junoswap.bitkub.creationEvent.name
                ),
                parameter: LAUNCHPADS.junoswap.bitkub.creationEvent.tokenParam,
            }),
            startBlock: LAUNCHPADS.junoswap.bitkub.startBlock,
        },
        [CONTRACT_NAMES['junoswap-v1_1:kubTestnet'].curve]: curveContract(
            'kubTestnet',
            LAUNCHPADS['junoswap-v1_1'].kubTestnet
        ),
        [CONTRACT_NAMES['junoswap-v1_1:kubTestnet'].token]: {
            abi: getAbi('erc20'),
            chain: 'kubTestnet',
            address: factory({
                address: LAUNCHPADS['junoswap-v1_1'].kubTestnet.address,
                event: abiEvent(
                    LAUNCHPADS['junoswap-v1_1'].kubTestnet.abi,
                    LAUNCHPADS['junoswap-v1_1'].kubTestnet.creationEvent.name
                ),
                parameter: LAUNCHPADS['junoswap-v1_1'].kubTestnet.creationEvent.tokenParam,
            }),
            startBlock: LAUNCHPADS['junoswap-v1_1'].kubTestnet.startBlock,
        },
        [CONTRACT_NAMES['durianfun:bitkub'].curve]: curveContract(
            'bitkub',
            LAUNCHPADS.durianfun.bitkub
        ),
        [CONTRACT_NAMES['durianfun:bitkub'].market]: {
            abi: LAUNCHPADS.durianfun.bitkub.marketAbi,
            chain: 'bitkub',
            address: factory({
                address: LAUNCHPADS.durianfun.bitkub.address,
                event: DURIANFUN_TOKEN_CREATED,
                parameter: 'market',
            }),
            startBlock: LAUNCHPADS.durianfun.bitkub.startBlock,
        },
        [CONTRACT_NAMES['durianfun:bitkub'].token]: {
            abi: getAbi('erc20'),
            chain: 'bitkub',
            address: factory({
                address: LAUNCHPADS.durianfun.bitkub.address,
                event: DURIANFUN_TOKEN_CREATED,
                parameter: LAUNCHPADS.durianfun.bitkub.creationEvent.tokenParam,
            }),
            startBlock: LAUNCHPADS.durianfun.bitkub.startBlock,
        },
        V3Factory: {
            abi: getAbi('v3Factory'),
            chain: 'kubTestnet',
            address: v3Factory(CHAINS.kubTestnet, 'junoswap'),
            startBlock: V3_TESTNET_START,
        },
        V3Pool: {
            abi: getAbi('v3Pool'),
            chain: 'kubTestnet',
            address: factory({
                address: v3Factory(CHAINS.kubTestnet, 'junoswap'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: V3_TESTNET_START,
        },
        V3FactoryBitkub: {
            abi: getAbi('v3Factory'),
            chain: 'bitkub',
            address: v3Factory(CHAINS.bitkub, 'junoswap'),
            startBlock: V3_BITKUB_START,
        },
        V3PoolBitkub: {
            abi: getAbi('v3Pool'),
            chain: 'bitkub',
            address: factory({
                address: v3Factory(CHAINS.bitkub, 'junoswap'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: V3_BITKUB_START,
        },
        V3FactoryJbc: {
            abi: getAbi('v3Factory'),
            chain: 'jbc',
            address: v3Factory(CHAINS.jbc, 'junoswap'),
            startBlock: V3_JBC_START,
        },
        V3PoolJbc: {
            abi: getAbi('v3Pool'),
            chain: 'jbc',
            address: factory({
                address: v3Factory(CHAINS.jbc, 'junoswap'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: V3_JBC_START,
        },
        NftPositionManager: {
            abi: getAbi('positionManager'),
            chain: 'kubTestnet',
            address: v3PositionManager(CHAINS.kubTestnet, 'junoswap'),
            startBlock: V3_TESTNET_START,
        },
        NftPositionManagerBitkub: {
            abi: getAbi('positionManager'),
            chain: 'bitkub',
            address: v3PositionManager(CHAINS.bitkub, 'junoswap'),
            startBlock: V3_BITKUB_START,
        },
        NftPositionManagerJbc: {
            abi: getAbi('positionManager'),
            chain: 'jbc',
            address: v3PositionManager(CHAINS.jbc, 'junoswap'),
            startBlock: V3_JBC_START,
        },
        V3Staker: {
            abi: V3_STAKER_ABI,
            chain: 'kubTestnet',
            address: v3Staker(CHAINS.kubTestnet, 'junoswap'),
            startBlock: V3_STAKER_TESTNET_START,
        },
        V3StakerBitkub: {
            abi: V3_STAKER_ABI,
            chain: 'bitkub',
            address: v3Staker(CHAINS.bitkub, 'junoswap'),
            startBlock: V3_STAKER_BITKUB_START,
        },
        V3StakerJbc: {
            abi: V3_STAKER_ABI,
            chain: 'jbc',
            address: v3Staker(CHAINS.jbc, 'junoswap'),
            startBlock: V3_STAKER_JBC_START,
        },
        JibswapFactory: {
            abi: getAbi('v2Factory'),
            chain: 'jbc',
            address: v2Factory(CHAINS.jbc, 'jibswap'),
            startBlock: JBC_SWAP_START,
        },
        JibswapPairSeeded: {
            abi: V2_PAIR_ABI,
            chain: 'jbc',
            address: seed('jibswap'),
            startBlock: JBC_SWAP_START,
        },
        JibswapPair: {
            abi: V2_PAIR_ABI,
            chain: 'jbc',
            address: factory({
                address: v2Factory(CHAINS.jbc, 'jibswap'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: JBC_SWAP_START,
        },
        UdonswapFactory: {
            abi: getAbi('v2Factory'),
            chain: 'bitkub',
            address: v2Factory(CHAINS.bitkub, 'udonswap'),
            startBlock: BITKUB_SWAP_START,
        },
        UdonswapPairSeeded: {
            abi: V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('udonswap'),
            startBlock: BITKUB_SWAP_START,
        },
        UdonswapPair: {
            abi: V2_PAIR_ABI,
            chain: 'bitkub',
            address: factory({
                address: v2Factory(CHAINS.bitkub, 'udonswap'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        PonderFactory: {
            abi: getAbi('v2Factory'),
            chain: 'bitkub',
            address: v2Factory(CHAINS.bitkub, 'ponder'),
            startBlock: BITKUB_SWAP_START,
        },
        PonderPairSeeded: {
            abi: V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('ponder'),
            startBlock: BITKUB_SWAP_START,
        },
        PonderPair: {
            abi: V2_PAIR_ABI,
            chain: 'bitkub',
            address: factory({
                address: v2Factory(CHAINS.bitkub, 'ponder'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        DiamonFactory: {
            abi: getAbi('v2Factory'),
            chain: 'bitkub',
            address: v2Factory(CHAINS.bitkub, 'diamon'),
            startBlock: BITKUB_SWAP_START,
        },
        DiamonPairSeeded: {
            abi: V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('diamon'),
            startBlock: BITKUB_SWAP_START,
        },
        DiamonPair: {
            abi: V2_PAIR_ABI,
            chain: 'bitkub',
            address: factory({
                address: v2Factory(CHAINS.bitkub, 'diamon'),
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3Factory: {
            abi: getAbi('v3Factory'),
            chain: 'bitkub',
            address: v3Factory(CHAINS.bitkub, 'kublerx'),
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3PoolSeeded: {
            abi: getAbi('v3Pool'),
            chain: 'bitkub',
            address: seed('kublerx'),
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3Pool: {
            abi: getAbi('v3Pool'),
            chain: 'bitkub',
            address: factory({
                address: v3Factory(CHAINS.bitkub, 'kublerx'),
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            }),
            startBlock: BITKUB_SWAP_START,
        },
        AggRouterJunoswap: {
            abi: getAbi('aggRouter'),
            chain: 'bitkub',
            address: AGG_ROUTER_BITKUB.address,
            startBlock: AGG_ROUTER_BITKUB.startBlock,
        },
    },
})

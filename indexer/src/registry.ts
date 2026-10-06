import type { Abi, Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { DURIANFUN_FACTORY_ABI, DURIANFUN_MARKET_ABI } from './abis/durianfun.js'
import tokens from '../tokens.json'
import launchpadDeployments from '../launchpads.json'
import externalPools from '../external-pools.json'

const CHAIN_IDS = {
    kubTestnet: 25925,
    bitkub: 96,
    jbc: 8899,
} as const

type ChainSlug = keyof typeof CHAIN_IDS

export function getChains(): Readonly<Record<ChainSlug, number>> {
    return CHAIN_IDS
}

function chainIdOf(chainSlug: string, where: string): number {
    const chainId = CHAIN_IDS[chainSlug as ChainSlug]
    if (chainId === undefined) throw new Error(`${where}: unknown chain slug "${chainSlug}"`)
    return chainId
}

const WRAPPED_NATIVE_ADDRESSES: Record<number, Address> = {}
const STABLECOIN_ADDRESSES: Record<number, ReadonlySet<string>> = {}
for (const [chainSlug, { wrappedNative, stablecoins }] of Object.entries(tokens)) {
    const chainId = chainIdOf(chainSlug, 'tokens.json')
    WRAPPED_NATIVE_ADDRESSES[chainId] = wrappedNative.toLowerCase() as Address
    STABLECOIN_ADDRESSES[chainId] = new Set(stablecoins.map((a) => a.toLowerCase()))
}

export function getWrappedNativeAddress(chainId: number): Address | undefined {
    return WRAPPED_NATIVE_ADDRESSES[chainId]
}

export function getStablecoins(chainId: number): ReadonlySet<string> | undefined {
    return STABLECOIN_ADDRESSES[chainId]
}

export const V2_DEX_CHAIN = {
    jibswap: CHAIN_IDS.jbc,
    udonswap: CHAIN_IDS.bitkub,
    ponder: CHAIN_IDS.bitkub,
    diamon: CHAIN_IDS.bitkub,
}

const v2Pools = new Map<string, { token0: string; token1: string; dex: string }>()
for (const [dex, chainId] of Object.entries(V2_DEX_CHAIN)) {
    for (const e of externalPools[dex as keyof typeof V2_DEX_CHAIN]) {
        const key = `${chainId}-${e.pair.toLowerCase()}`
        const prior = v2Pools.get(key)?.dex
        if (prior && prior !== dex) {
            throw new Error(
                `external-pools.json: pool ${e.pair} listed under both "${prior}" and "${dex}"`
            )
        }
        v2Pools.set(key, { token0: e.token0.toLowerCase(), token1: e.token1.toLowerCase(), dex })
    }
}

const v3Pools = new Map(
    externalPools.kublerx.map(({ pool, token0, token1, fee, tickSpacing }) => [
        pool.toLowerCase(),
        { token0: token0.toLowerCase(), token1: token1.toLowerCase(), fee, tickSpacing },
    ])
)

export const getSeedV2Pool = (chainId: number, address: string) =>
    v2Pools.get(`${chainId}-${address.toLowerCase()}`)

export const getSeedV3Pool = (address: string) => v3Pools.get(address.toLowerCase())

export const getSeedPoolAddresses = (dex: keyof typeof externalPools) =>
    (externalPools[dex] as Array<{ pair?: string; pool?: string }>).map(
        (p) => (p.pair ?? p.pool) as Address
    )

interface Deployment {
    address: Address | readonly Address[]
    startBlock: number
    feeCollector?: Address
    lpLocker?: Address
}

export interface CurveParams {
    virtualReserve: bigint
    totalSupply: bigint
    pumpFeeBps: bigint
}

interface CreationEvent {
    name: string
    tokenParam: string
    marketParam?: string
}

interface LaunchpadSpec {
    abi: Abi
    marketAbi?: Abi
    creationEvent: CreationEvent
    curve: CurveParams
}

export interface Launchpad extends Deployment, LaunchpadSpec {
    launchpadId: string
    chainId: number
    chainSlug: string
    contracts: {
        curve: string
        token: string
        market?: string
        feeCollector?: string
    }
}

const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n

export const DURIANFUN_VIRTUAL_RESERVE = 1_523_821_243_257_000_000_000n

const JUNOSWAP_V1_SPEC: LaunchpadSpec = {
    abi: getAbi('bondingCurveV1'),
    creationEvent: { name: 'Creation', tokenParam: 'tokenAddr' },
    curve: { virtualReserve: 3400n * 10n ** 18n, totalSupply: TOTAL_SUPPLY, pumpFeeBps: 100n },
}

const SPECS: Record<string, LaunchpadSpec> = {
    junoswap: JUNOSWAP_V1_SPEC,
    'junoswap-v1_1': JUNOSWAP_V1_SPEC,
    durianfun: {
        abi: DURIANFUN_FACTORY_ABI,
        marketAbi: DURIANFUN_MARKET_ABI,
        creationEvent: { name: 'TokenCreated', tokenParam: 'token', marketParam: 'market' },
        curve: {
            virtualReserve: DURIANFUN_VIRTUAL_RESERVE,
            totalSupply: TOTAL_SUPPLY,
            pumpFeeBps: 0n,
        },
    },
}

const pascal = (s: string) =>
    s
        .split(/[^a-zA-Z0-9]+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')

const LAUNCHPADS: Launchpad[] = Object.entries(
    launchpadDeployments as Record<string, Record<string, Deployment>>
).flatMap(([launchpadId, byChainSlug]) =>
    Object.entries(byChainSlug).map(([chainSlug, deployment]) => {
        const where = `launchpads.json: "${launchpadId}" on "${chainSlug}"`
        const spec = SPECS[launchpadId]
        if (!spec) throw new Error(`${where}: no launchpad spec registered`)
        const chainId = chainIdOf(chainSlug, where)
        const suffix = pascal(launchpadId) + pascal(chainSlug)
        const contracts: Launchpad['contracts'] = {
            curve: `Curve${suffix}`,
            token: `LaunchToken${suffix}`,
        }
        if (spec.marketAbi) contracts.market = `Market${suffix}`
        if (deployment.feeCollector) contracts.feeCollector = `FeeCollector${suffix}`
        return { launchpadId, chainId, chainSlug, ...deployment, ...spec, contracts }
    })
)

export function getLaunchpads(): Launchpad[] {
    return LAUNCHPADS
}

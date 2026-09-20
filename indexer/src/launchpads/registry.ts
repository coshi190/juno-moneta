import type { Abi, Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { getChains, getCurveDeployment } from '../config.js'
import { DURIANFUN_FACTORY_ABI, DURIANFUN_MARKET_ABI } from '../abis/durianfun.js'

export interface CurveParams {
    virtualReserve: bigint
    totalSupply: bigint
    pumpFeeBps: bigint
}

export interface CreationEvent {
    name: string
    tokenParam: string
}

export interface Launchpad {
    launchpadId: string
    chainId: number
    address: Address | readonly Address[]
    startBlock: number
    feeCollector?: Address
    lpLocker?: Address
    abi: Abi
    marketAbi?: Abi
    creationEvent: CreationEvent
    curve: CurveParams
}

const CHAINS = getChains()

function deployed(launchpadId: string, chainId: number) {
    const deployment = getCurveDeployment(chainId, launchpadId)
    if (!deployment) {
        throw new Error(`No curve deployment for "${launchpadId}" on chain ${chainId}`)
    }
    return deployment
}

const JUNOSWAP_V1_CURVE: CurveParams = {
    virtualReserve: 3400n * 10n ** 18n,
    totalSupply: 1_000_000_000n * 10n ** 18n,
    pumpFeeBps: 100n,
}

const JUNOSWAP_V1_CREATION = {
    name: 'Creation',
    tokenParam: 'tokenAddr',
} as const satisfies CreationEvent

export const DURIANFUN_VIRTUAL_RESERVE = 1_523_821_243_257_000_000_000n

const DURIANFUN_CURVE: CurveParams = {
    virtualReserve: DURIANFUN_VIRTUAL_RESERVE,
    totalSupply: 1_000_000_000n * 10n ** 18n,
    pumpFeeBps: 0n,
}

const DURIANFUN_CREATION = {
    name: 'TokenCreated',
    tokenParam: 'token',
} as const satisfies CreationEvent

export const LAUNCHPADS = {
    junoswap: {
        kubTestnet: {
            ...deployed('junoswap', CHAINS.kubTestnet),
            abi: getAbi('bondingCurveV1'),
            creationEvent: JUNOSWAP_V1_CREATION,
            curve: JUNOSWAP_V1_CURVE,
        },
        bitkub: {
            ...deployed('junoswap', CHAINS.bitkub),
            abi: getAbi('bondingCurveV1'),
            creationEvent: JUNOSWAP_V1_CREATION,
            curve: JUNOSWAP_V1_CURVE,
        },
    },
    'junoswap-v1_1': {
        kubTestnet: {
            ...deployed('junoswap-v1_1', CHAINS.kubTestnet),
            abi: getAbi('bondingCurveV1'),
            creationEvent: JUNOSWAP_V1_CREATION,
            curve: JUNOSWAP_V1_CURVE,
        },
    },
    durianfun: {
        bitkub: {
            ...deployed('durianfun', CHAINS.bitkub),
            abi: DURIANFUN_FACTORY_ABI,
            marketAbi: DURIANFUN_MARKET_ABI,
            creationEvent: DURIANFUN_CREATION,
            curve: DURIANFUN_CURVE,
        },
    },
} as const

const LAUNCHPADS_BY_CHAIN: Record<number, Launchpad[]> = (() => {
    const byChain: Record<number, Launchpad[]> = {}
    for (const [launchpadId, byChainSlug] of Object.entries(LAUNCHPADS)) {
        for (const [chainSlug, entry] of Object.entries(byChainSlug)) {
            const chainId = CHAINS[chainSlug as keyof typeof CHAINS]
            if (chainId === undefined) throw new Error(`unknown chain slug "${chainSlug}"`)
            ;(byChain[chainId] ??= []).push({
                launchpadId,
                chainId,
                address: entry.address as Address | readonly Address[],
                startBlock: entry.startBlock,
                feeCollector: 'feeCollector' in entry ? (entry.feeCollector as Address) : undefined,
                lpLocker: 'lpLocker' in entry ? (entry.lpLocker as Address) : undefined,
                abi: entry.abi as Abi,
                marketAbi: 'marketAbi' in entry ? (entry.marketAbi as Abi) : undefined,
                creationEvent: entry.creationEvent,
                curve: entry.curve,
            })
        }
    }
    return byChain
})()

export function getLaunchpads(chainId: number): Launchpad[] {
    return LAUNCHPADS_BY_CHAIN[chainId] ?? []
}

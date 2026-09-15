import type { Address } from 'viem'

const CHAIN_IDS = {
    kubTestnet: 25925,
    bitkub: 96,
    jbc: 8899,
    bsc: 56,
    base: 8453,
    worldchain: 480,
} as const

export type ChainSlug = keyof typeof CHAIN_IDS

export function getChains(): Readonly<Record<ChainSlug, number>> {
    return CHAIN_IDS
}

const WRAPPED_NATIVE_ADDRESSES: Record<number, Address> = {
    [CHAIN_IDS.kubTestnet]: '0x700d3ba307e1256e509ed3e45d6f9dff441d6907',
    [CHAIN_IDS.bitkub]: '0x67ebd850304c70d983b2d1b93ea79c7cd6c3f6b5',
    [CHAIN_IDS.jbc]: '0xc4b7c87510675167643e3de6eeed4d2c06a9e747',
    [CHAIN_IDS.worldchain]: '0x4200000000000000000000000000000000000006',
    [CHAIN_IDS.base]: '0x4200000000000000000000000000000000000006',
    [CHAIN_IDS.bsc]: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
}

const STABLECOIN_ADDRESSES: Record<number, ReadonlySet<string>> = {
    [CHAIN_IDS.kubTestnet]: new Set(['0x70138f1b88bee73dd2cb06f24146f964dde6144e']),
    [CHAIN_IDS.bitkub]: new Set([
        '0x7d984c24d2499d840eb3b7016077164e15e5faa6',
        '0x21cdc3706b8c7b1836df0e533dd884069521350b',
        '0x31929a0fd776f971c5dd14bf03e1f9ff69d9c91c',
    ]),
    [CHAIN_IDS.jbc]: new Set([
        '0x24599b658b57f91e7643f4f154b16bcd2884f9ac',
        '0xfd8ef75c1cb00a594d02df48addc27414bd07f8a',
    ]),
    [CHAIN_IDS.worldchain]: new Set(['0x79a02482a880bce3f13e09da970dc34db4cd24d1']),
    [CHAIN_IDS.base]: new Set([
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
    ]),
    [CHAIN_IDS.bsc]: new Set([
        '0x55d398326f99059ff775485246999027b3197955',
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    ]),
}

export function getWrappedNativeAddress(chainId: number): Address | undefined {
    return WRAPPED_NATIVE_ADDRESSES[chainId]
}

export function getStablecoins(chainId: number): ReadonlySet<string> | undefined {
    return STABLECOIN_ADDRESSES[chainId]
}

interface Deployment {
    address: Address
    startBlock: number
}

/** Chains absent from the table have no router deployed. */
const AGG_ROUTER_DEPLOYMENTS: Record<number, Deployment> = {
    [CHAIN_IDS.bitkub]: {
        address: '0x869A40921A332e0D79300F91361A3DC77F2a0ebc',
        startBlock: 32685221,
    },
}

export function getAggRouterDeployment(chainId: number): Deployment | undefined {
    return AGG_ROUTER_DEPLOYMENTS[chainId]
}

import type { Address } from 'viem'

const CHAIN_IDS = {
    kubTestnet: 25925,
    bitkub: 96,
    jbc: 8899,
} as const

type ChainSlug = keyof typeof CHAIN_IDS

export function getChains(): Readonly<Record<ChainSlug, number>> {
    return CHAIN_IDS
}

const WRAPPED_NATIVE_ADDRESSES: Record<number, Address> = {
    [CHAIN_IDS.kubTestnet]: '0x700d3ba307e1256e509ed3e45d6f9dff441d6907',
    [CHAIN_IDS.bitkub]: '0x67ebd850304c70d983b2d1b93ea79c7cd6c3f6b5',
    [CHAIN_IDS.jbc]: '0xc4b7c87510675167643e3de6eeed4d2c06a9e747',
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
}

export function getWrappedNativeAddress(chainId: number): Address | undefined {
    return WRAPPED_NATIVE_ADDRESSES[chainId]
}

export function getStablecoins(chainId: number): ReadonlySet<string> | undefined {
    return STABLECOIN_ADDRESSES[chainId]
}

interface Deployment {
    address: Address | readonly Address[]
    startBlock: number
}

const CURVE_DEPLOYMENTS: Record<string, Record<number, Deployment>> = {
    junoswap: {
        [CHAIN_IDS.kubTestnet]: {
            address: '0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9',
            startBlock: 29065000,
        },
        [CHAIN_IDS.bitkub]: {
            address: '0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e',
            startBlock: 32995517,
        },
    },

    'junoswap-v1_1': {
        [CHAIN_IDS.kubTestnet]: {
            address: '0x22Cf23cd7799C3A24D53191C8514Dd7E42fEF790',
            startBlock: 33661943,
        },
    },

    durianfun: {
        [CHAIN_IDS.bitkub]: {
            address: [
                '0xeadEc9dA89F97Ae6215362EBA4B33F3F1d1775b2', // V4.2
                '0xdf4f3dB298A9aDe853191F58b4b2a322D47EC005', // V4.5
                '0x89b6b73BD18dbEA0e2218c25c1963fd5FBaB3c87', // V4.6.6
                '0x0480017E51dC813a0fad8aA73EAb2f8476ac0e8F', // V4.6.7
                '0xa1000BB39f36a630F1AB1b245B25Ca75a6744Aa5',
                '0x96D0117DE988C20f4E4D4B27b46351D760b99D97',
                '0xE3861e300043d8c20A927340cbA6379D0BECb793', // V5
            ],
            startBlock: 32202357,
        },
    },
}

export function getCurveDeployment(chainId: number, launchpadId: string): Deployment | undefined {
    return CURVE_DEPLOYMENTS[launchpadId]?.[chainId]
}

const AGG_ROUTER_DEPLOYMENTS: Record<number, Deployment> = {
    [CHAIN_IDS.bitkub]: {
        address: '0x869A40921A332e0D79300F91361A3DC77F2a0ebc',
        startBlock: 32685221,
    },
}

export function getAggRouterDeployment(chainId: number): Deployment | undefined {
    return AGG_ROUTER_DEPLOYMENTS[chainId]
}

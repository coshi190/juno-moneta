import { zeroAddress, type Address } from 'viem'
import { byChainId, CHAIN_IDS } from './chains.js'
import deployments from './data/deployments.json' with { type: 'json' }

interface Deployment {
    address: Address
    startBlock: number
}

const asDeployment = ({ address, startBlock }: { address: string; startBlock: number }) =>
    ({ address: address as Address, startBlock }) satisfies Deployment

export const BONDING_CURVE_DEPLOYMENTS: Record<number, Deployment> = byChainId(
    deployments.bondingCurve,
    asDeployment
)

export const AGG_ROUTER_DEPLOYMENTS: Record<number, Deployment> = byChainId(
    deployments.aggRouter,
    asDeployment
)

export const V3_STAKER_START_BLOCKS: Record<number, number> = byChainId(
    deployments.v3StakerStartBlocks,
    (block) => block
)

export const BONDING_CURVE_JUNOSWAP_CHAIN_ID = CHAIN_IDS.kubTestnet

export function getBondingCurveAddress(chainId: number): Address | undefined {
    const address = BONDING_CURVE_DEPLOYMENTS[chainId]?.address
    return address && address !== zeroAddress ? address : undefined
}

export function isLaunchpadChain(chainId: number): boolean {
    return getBondingCurveAddress(chainId) !== undefined
}

export const LAUNCHPAD_CHAIN_IDS: number[] = Object.keys(BONDING_CURVE_DEPLOYMENTS)
    .map(Number)
    .filter(isLaunchpadChain)

export const BONDING_CURVE_ADDRESS_BY_CHAIN: Record<number, string> = Object.fromEntries(
    Object.entries(BONDING_CURVE_DEPLOYMENTS).map(([chainId, { address }]) => [
        Number(chainId),
        address.toLowerCase(),
    ])
)

export function getAggRouterAddress(chainId: number): Address | undefined {
    const address = AGG_ROUTER_DEPLOYMENTS[chainId]?.address
    return address && address !== zeroAddress ? address : undefined
}

export function isAggRouterChain(chainId: number): boolean {
    return getAggRouterAddress(chainId) !== undefined
}

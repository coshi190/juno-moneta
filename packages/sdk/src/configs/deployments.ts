import { zeroAddress, type Address } from 'viem'
import { byChainId } from './chains.js'
import deployments from './data/deployments.json' with { type: 'json' }

export interface Deployment {
    address: Address
    startBlock: number
}

const asDeployment = ({ address, startBlock }: { address: string; startBlock: number }) =>
    ({ address: address as Address, startBlock }) satisfies Deployment

const BONDING_CURVE_DEPLOYMENTS: Record<number, Deployment> = byChainId(
    deployments.bondingCurve,
    asDeployment
)

const AGG_ROUTER_DEPLOYMENTS: Record<number, Deployment> = byChainId(
    deployments.aggRouter,
    asDeployment
)

const deployed = (table: Record<number, Deployment>, chainId: number) => {
    const entry = table[chainId]
    return entry && entry.address !== zeroAddress ? entry : undefined
}

export function getBondingCurveDeployment(chainId: number): Deployment | undefined {
    return deployed(BONDING_CURVE_DEPLOYMENTS, chainId)
}

export function getAggRouterDeployment(chainId: number): Deployment | undefined {
    return deployed(AGG_ROUTER_DEPLOYMENTS, chainId)
}

import { zeroAddress, type Address } from 'viem'
import { byChainId } from './chains.js'
import deployments from './data/deployments.json' with { type: 'json' }

export interface Deployment {
    address: Address
    startBlock: number
}

const asDeployment = ({ address, startBlock }: { address: string; startBlock: number }) =>
    ({ address: address as Address, startBlock }) satisfies Deployment

export const DEFAULT_LAUNCHPAD_ID = 'junoswap'

const BONDING_CURVE_DEPLOYMENTS: Record<number, Record<string, Deployment>> = byChainId(
    deployments.bondingCurve as Record<
        string,
        Record<string, { address: string; startBlock: number }>
    >,
    (byLaunchpad) =>
        Object.fromEntries(
            Object.entries(byLaunchpad).map(([launchpadId, entry]) => [
                launchpadId,
                asDeployment(entry),
            ])
        )
)

const AGG_ROUTER_DEPLOYMENTS: Record<number, Deployment> = byChainId(
    deployments.aggRouter,
    asDeployment
)

const deployed = (table: Record<number, Deployment>, chainId: number) => {
    const entry = table[chainId]
    return entry && entry.address !== zeroAddress ? entry : undefined
}

export function getBondingCurveDeployment(
    chainId: number,
    launchpadId: string = DEFAULT_LAUNCHPAD_ID
): Deployment | undefined {
    const entry = BONDING_CURVE_DEPLOYMENTS[chainId]?.[launchpadId]
    return entry && entry.address !== zeroAddress ? entry : undefined
}

export function getAggRouterDeployment(chainId: number): Deployment | undefined {
    return deployed(AGG_ROUTER_DEPLOYMENTS, chainId)
}

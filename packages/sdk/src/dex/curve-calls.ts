import { type Abi, type Address } from 'viem'
import { BONDING_CURVE_JUNOSWAP_V1_ABI } from '../abis/bc-juno-v1.js'
import { BONDING_CURVE_JUNOSWAP_V1_1_ABI } from '../abis/bc-juno-v1-1.js'
import { DEFAULT_LAUNCHPAD_ID, getBondingCurveDeployment } from '../configs/deployments.js'
import { SwapPlanError, type ContractCall } from './plan-swap.js'

export interface CurveTokenMetadata {
    name: string
    symbol: string
    logo: string
    description: string
    link1: string
    link2: string
    link3: string
}

export type CurveAction =
    | { kind: 'create'; metadata: CurveTokenMetadata; value: bigint }
    | { kind: 'buy'; token: Address; minOut: bigint; value: bigint }
    | { kind: 'sell'; token: Address; amountIn: bigint; minOut: bigint }
    | { kind: 'graduate'; token: Address }

export function planCurveCall(
    chainId: number,
    action: CurveAction,
    launchpadId: string = DEFAULT_LAUNCHPAD_ID
): ContractCall {
    const deployment = getBondingCurveDeployment(chainId, launchpadId)
    if (!deployment) {
        throw new SwapPlanError(`No "${launchpadId}" bonding curve deployed on chain ${chainId}`)
    }

    const abi = (
        launchpadId === 'junoswap-v1_1'
            ? BONDING_CURVE_JUNOSWAP_V1_1_ABI
            : BONDING_CURVE_JUNOSWAP_V1_ABI
    ) as Abi
    const base = { address: deployment.address, abi }

    switch (action.kind) {
        case 'create': {
            const { name, symbol, logo, description, link1, link2, link3 } = action.metadata
            return {
                ...base,
                functionName: 'createToken',
                args: [name, symbol, logo, description, link1, link2, link3],
                value: action.value,
            }
        }
        case 'buy':
            return {
                ...base,
                functionName: 'buy',
                args: [action.token, action.minOut],
                value: action.value,
            }
        case 'sell':
            return {
                ...base,
                functionName: 'sell',
                args: [action.token, action.amountIn, action.minOut],
            }
        case 'graduate':
            return { ...base, functionName: 'graduate', args: [action.token] }
    }
}

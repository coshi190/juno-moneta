import { formatEther, type Abi, type Address } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI } from '../abis/bonding-curve-junoswap.js'
import { getBondingCurveDeployment } from '../configs/deployments.js'
import { calculateExactGraduationReserve } from './curve.js'
import { batchRead, type ReadClient } from './multicall.js'
import { SwapPlanError, type ContractCall } from './plan-swap.js'

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

const CREATION_EVENT = abiEvent(BONDING_CURVE_JUNOSWAP_ABI, 'Creation')

export const getCurveCreationEvent = () => CREATION_EVENT

export interface CurveState {
    createFee: bigint
    createFeeEther: string
    initialNative: bigint
    initialNativeEther: string
    virtualAmount: bigint
    virtualAmountEther: string
    graduationAmount: bigint
    graduationAmountEther: string
    raiseTarget: bigint
    raiseTargetEther: string
    nativeReserve: bigint
    nativeReserveEther: string
    tokenReserve: bigint
    tokenReserveEther: string
}

export interface CurveStateParams {
    chainId: number
    token?: Address
}

const CURVE_GLOBALS = ['createFee', 'initialNative', 'virtualAmount', 'graduationAmount'] as const

export async function getCurveState(
    client: ReadClient,
    params: CurveStateParams
): Promise<CurveState | null> {
    const deployment = getBondingCurveDeployment(params.chainId)
    if (!deployment) return null

    const abi = BONDING_CURVE_JUNOSWAP_ABI as Abi
    const calls: ContractCall[] = CURVE_GLOBALS.map((functionName) => ({
        address: deployment.address,
        abi,
        functionName,
        args: [],
    }))
    if (params.token) {
        calls.push({
            address: deployment.address,
            abi,
            functionName: 'pumpReserve',
            args: [params.token],
        })
    }

    const results = await batchRead(client, calls)
    const [createFee, initialNative, virtualAmount, graduationAmount] = CURVE_GLOBALS.map(
        (_, index) => {
            const result = results[index]
            return result?.status === 'success' ? (result.result as bigint) : undefined
        }
    )
    if (
        createFee === undefined ||
        initialNative === undefined ||
        virtualAmount === undefined ||
        graduationAmount === undefined
    ) {
        return null
    }

    const reserves = params.token ? results[CURVE_GLOBALS.length] : undefined
    const [nativeReserve, tokenReserve] =
        reserves?.status === 'success' ? (reserves.result as readonly [bigint, bigint]) : [0n, 0n]

    const raiseTarget = calculateExactGraduationReserve(virtualAmount, graduationAmount)

    return {
        createFee,
        createFeeEther: formatEther(createFee),
        initialNative,
        initialNativeEther: formatEther(initialNative),
        virtualAmount,
        virtualAmountEther: formatEther(virtualAmount),
        graduationAmount,
        graduationAmountEther: formatEther(graduationAmount),
        raiseTarget,
        raiseTargetEther: formatEther(raiseTarget),
        nativeReserve,
        nativeReserveEther: formatEther(nativeReserve),
        tokenReserve,
        tokenReserveEther: formatEther(tokenReserve),
    }
}

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

export function planCurveCall(chainId: number, action: CurveAction): ContractCall {
    const deployment = getBondingCurveDeployment(chainId)
    if (!deployment) throw new SwapPlanError(`No bonding curve deployed on chain ${chainId}`)

    const base = { address: deployment.address, abi: BONDING_CURVE_JUNOSWAP_ABI as Abi }

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

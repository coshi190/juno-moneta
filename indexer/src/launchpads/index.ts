import type { Launchpad } from '../registry.js'
import { junoswapV1Adapter, junoswapV1_1Adapter } from './juno-v1.js'
import { durianfunAdapter } from './durianfun.js'

export interface HandlerArgs {
    event: any
    context: any
}

interface NormalizedCreation {
    tokenAddr: string
    creator: string
    logo: string
    description: string
    link1: string
    link2: string
    link3: string
    createdTime: number
    graduationTarget?: number
    market?: string
    name?: string
    symbol?: string
}

export interface NormalizedSwap {
    tokenAddr: string
    sender: string
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    creatorFeeNative?: bigint
    virtualReserve?: bigint
}

interface NormalizedGraduation {
    tokenAddr: string
    ammPool?: string
}

type ContractRole = 'curve' | 'market'

interface SwapBinding {
    contract: ContractRole
    event: string
    isBuy?: boolean
}

interface LaunchpadBindings {
    creation: { contract: ContractRole; event: string }
    swaps: readonly SwapBinding[]
    graduation: { contract: ContractRole; event: string }
}

export interface LaunchpadAdapter {
    launchpadId: string
    bindings: LaunchpadBindings
    creation(args: HandlerArgs): Promise<NormalizedCreation>
    swap(args: HandlerArgs, isBuy?: boolean): Promise<NormalizedSwap>
    graduation(args: HandlerArgs): Promise<NormalizedGraduation>
}

const ADAPTERS: Record<string, LaunchpadAdapter> = {
    [junoswapV1Adapter.launchpadId]: junoswapV1Adapter,
    [junoswapV1_1Adapter.launchpadId]: junoswapV1_1Adapter,
    [durianfunAdapter.launchpadId]: durianfunAdapter,
}

export function getAdapter(launchpadId: string): LaunchpadAdapter {
    const adapter = ADAPTERS[launchpadId]
    if (!adapter) throw new Error(`No launchpad adapter registered for "${launchpadId}"`)
    return adapter
}

export function contractNameFor(launchpad: Launchpad, role: ContractRole): string {
    if (role === 'curve') return launchpad.contracts.curve
    const market = launchpad.contracts.market
    if (!market) throw new Error(`No "market" contract registered for ${launchpad.contracts.curve}`)
    return market
}

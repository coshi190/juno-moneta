export interface HandlerArgs {
    event: any
    context: any
}

export interface NormalizedCreation {
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

export interface NormalizedGraduation {
    tokenAddr: string
    ammPool?: string
}

export type ContractRole = 'curve' | 'market'

export interface SwapBinding {
    contract: ContractRole
    event: string
    isBuy?: boolean
}

export interface LaunchpadBindings {
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

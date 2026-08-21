import { getV3Config, type DEXType } from '../configs/dex-config.js'
import { getFeeTiers } from '../dex/v3-pools.js'

const DEFAULT_TICK_SPACING = 60

export const TICK_SPACING_BY_FEE: Record<number, number> = {
    100: 1,
    500: 10,
    2500: 50,
    3000: 60,
    10000: 200,
}

export interface FeeTierInfo {
    fee: number
    tickSpacing: number
}

export function getTickSpacing(fee: number): number {
    return TICK_SPACING_BY_FEE[fee] ?? DEFAULT_TICK_SPACING
}

export function getFeeTierInfo(fee: number): FeeTierInfo {
    return { fee, tickSpacing: getTickSpacing(fee) }
}

export function listFeeTiers(chainId: number, dexId?: DEXType): FeeTierInfo[] {
    return getFeeTiers(getV3Config(chainId, dexId)).map(getFeeTierInfo)
}

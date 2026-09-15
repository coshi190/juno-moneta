import { AGG_ROUTER_JUNOSWAP_ABI } from './agg-router-junoswap.js'
import { BONDING_CURVE_JUNOSWAP_ABI } from './bc-juno.js'
import { ERC20_ABI } from './erc20.js'
import { KAP20_ABI } from './kap20.js'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from './nonfungible-position-manager.js'
import { V2_FACTORY_ABI } from './v2-factory.js'
import { V3_FACTORY_ABI } from './v3-factory.js'
import { V3_POOL_ABI } from './v3-pool.js'
import { V3_SWAP_ROUTER_ABI } from './v3-swap-router.js'
import { WETH9_ABI } from './weth9.js'

const ABIS = {
    aggRouter: AGG_ROUTER_JUNOSWAP_ABI,
    bondingCurve: BONDING_CURVE_JUNOSWAP_ABI,
    erc20: ERC20_ABI,
    kap20: KAP20_ABI,
    positionManager: NONFUNGIBLE_POSITION_MANAGER_ABI,
    v2Factory: V2_FACTORY_ABI,
    v3Factory: V3_FACTORY_ABI,
    v3Pool: V3_POOL_ABI,
    v3SwapRouter: V3_SWAP_ROUTER_ABI,
    weth9: WETH9_ABI,
} as const

export type AbiName = keyof typeof ABIS

export function getAbi<K extends AbiName>(name: K): (typeof ABIS)[K] {
    return ABIS[name]
}

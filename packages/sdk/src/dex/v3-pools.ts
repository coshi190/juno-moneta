import { zeroAddress, type Abi, type Address } from 'viem'
import { UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI } from '../abis/index.js'
import {
    FEE_TIERS,
    ProtocolType,
    getDexConfig,
    getDexsByProtocol,
    getV3Config,
    isV2Config,
    isV3Config,
    type DEXType,
    type V3Config,
} from '../configs/dex-config.js'
import { getSwapAddress } from './native.js'
import type { ContractCall } from './plan-swap.js'
import type { ReadResult } from './multicall.js'

export const ALL_FEE_TIERS: number[] = Object.values(FEE_TIERS)

export function getFeeTiers(config: V3Config | undefined): number[] {
    return config?.feeTiers?.length ? config.feeTiers : ALL_FEE_TIERS
}

export function poolKey(factory: Address, tokenA: Address, tokenB: Address, fee: number): string {
    const a = tokenA.toLowerCase()
    const b = tokenB.toLowerCase()
    const [token0, token1] = a < b ? [a, b] : [b, a]
    return `${factory.toLowerCase()}:${token0}:${token1}:${fee}`
}

export function resolveDexIds(
    chainId: number,
    protocol: ProtocolType,
    dexId?: DEXType | DEXType[]
): DEXType[] {
    if (dexId === undefined) return getDexsByProtocol(chainId, protocol)

    const isProtocol = protocol === ProtocolType.V3 ? isV3Config : isV2Config
    const requested = Array.isArray(dexId) ? dexId : [dexId]
    return requested.filter((id) => {
        const config = getDexConfig(chainId, id)
        return !!config && isProtocol(config)
    })
}

export interface V3PoolCandidate {
    dexId: DEXType
    factory: Address
    quoter: Address
    fee: number
    tokenIn: Address
    tokenOut: Address
}

export interface BuildPoolCandidatesInput {
    chainId: number
    dexIds: readonly DEXType[]
    tokenIn: Address
    tokenOut: Address
}

export function buildPoolCandidates({
    chainId,
    dexIds,
    tokenIn,
    tokenOut,
}: BuildPoolCandidatesInput): V3PoolCandidate[] {
    const candidates: V3PoolCandidate[] = []

    for (const dexId of dexIds) {
        const config = getV3Config(chainId, dexId)
        if (!config) continue

        const resolvedIn = getSwapAddress(tokenIn, chainId)
        const resolvedOut = getSwapAddress(tokenOut, chainId)
        if (resolvedIn.toLowerCase() === resolvedOut.toLowerCase()) continue

        for (const fee of getFeeTiers(config)) {
            candidates.push({
                dexId,
                factory: config.factory,
                quoter: config.quoter,
                fee,
                tokenIn: resolvedIn,
                tokenOut: resolvedOut,
            })
        }
    }

    return candidates
}

export function buildGetPoolCalls(candidates: readonly V3PoolCandidate[]): ContractCall[] {
    return candidates.map((candidate) => ({
        address: candidate.factory,
        abi: UNISWAP_V3_FACTORY_ABI as Abi,
        functionName: 'getPool',
        args: [candidate.tokenIn, candidate.tokenOut, candidate.fee],
    }))
}

export function buildLiquidityCalls(pools: readonly Address[]): ContractCall[] {
    return pools.map((pool) => ({
        address: pool,
        abi: UNISWAP_V3_POOL_ABI as Abi,
        functionName: 'liquidity',
        args: [],
    }))
}

export interface ResolvedPool {
    candidate: V3PoolCandidate
    pool: Address
}

export interface DiscoveredV3Pool {
    dexId: DEXType
    pool: Address
    fee: number
    liquidity: bigint
}

export function resolvePoolAddresses(
    candidates: readonly V3PoolCandidate[],
    results: readonly ReadResult[]
): ResolvedPool[] {
    const resolved: ResolvedPool[] = []

    candidates.forEach((candidate, index) => {
        const result = results[index]
        if (result?.status !== 'success') return

        const pool = result.result as Address | undefined
        if (!pool || pool.toLowerCase() === zeroAddress) return

        resolved.push({ candidate, pool })
    })

    return resolved
}

export function pickBestPools(
    resolved: readonly ResolvedPool[],
    liquidityResults: readonly ReadResult[]
): Map<DEXType, DiscoveredV3Pool> {
    const best = new Map<DEXType, DiscoveredV3Pool>()

    resolved.forEach(({ candidate, pool }, index) => {
        const result = liquidityResults[index]
        if (result?.status !== 'success') return

        const liquidity = result.result as bigint | undefined
        if (typeof liquidity !== 'bigint' || liquidity <= 0n) return

        const incumbent = best.get(candidate.dexId)
        if (incumbent && incumbent.liquidity >= liquidity) return

        best.set(candidate.dexId, { dexId: candidate.dexId, pool, fee: candidate.fee, liquidity })
    })

    return best
}

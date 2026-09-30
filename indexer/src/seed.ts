import externalPools from '../external-pools.json'
import { getChains } from './config.js'

const CHAINS = getChains()

export const V2_DEX_CHAIN = {
    jibswap: CHAINS.jbc,
    udonswap: CHAINS.bitkub,
    ponder: CHAINS.bitkub,
    diamon: CHAINS.bitkub,
}

const v2Pools = new Map<string, { token0: string; token1: string; dex: string }>()
for (const [dex, chainId] of Object.entries(V2_DEX_CHAIN)) {
    for (const e of externalPools[dex as keyof typeof V2_DEX_CHAIN]) {
        const key = `${chainId}-${e.pair.toLowerCase()}`
        const prior = v2Pools.get(key)?.dex
        if (prior && prior !== dex) {
            throw new Error(
                `external-pools.json: pool ${e.pair} listed under both "${prior}" and "${dex}"`
            )
        }
        v2Pools.set(key, { token0: e.token0.toLowerCase(), token1: e.token1.toLowerCase(), dex })
    }
}

const v3Pools = new Map(
    externalPools.kublerx.map(({ pool, token0, token1, fee, tickSpacing }) => [
        pool.toLowerCase(),
        { token0: token0.toLowerCase(), token1: token1.toLowerCase(), fee, tickSpacing },
    ])
)

export const getSeedV2Pool = (chainId: number, address: string) =>
    v2Pools.get(`${chainId}-${address.toLowerCase()}`)

export const getSeedV3Pool = (address: string) => v3Pools.get(address.toLowerCase())

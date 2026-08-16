import { createPublicClient, http } from 'viem'
import {
    ERC20_ABI,
    NONFUNGIBLE_POSITION_MANAGER_ABI,
    UNISWAP_V3_POOL_ABI,
    getV3Config,
} from '@coshi190/junoswap-sdk'

const RPC_URLS: Record<number, string> = {
    25925: process.env.PONDER_RPC_URL_25925 ?? 'https://rpc-testnet.bitkubchain.io',
    96: process.env.PONDER_RPC_URL_96 ?? 'https://rpc.bitkubchain.io',
    8899: process.env.PONDER_RPC_URL_8899 ?? 'https://rpc-l1.jibchain.net',
}

const clients: Record<number, ReturnType<typeof createPublicClient>> = {}

function getClient(chainId: number) {
    if (!clients[chainId]) {
        clients[chainId] = createPublicClient({
            transport: http(RPC_URLS[chainId]),
        })
    }
    return clients[chainId]
}

export async function readERC20Metadata(
    chainId: number,
    address: string
): Promise<{ name: string; symbol: string; decimals: number }> {
    const client = getClient(chainId)
    const addr = address as `0x${string}`

    try {
        const [name, symbol, decimals] = await Promise.all([
            client.readContract({ abi: ERC20_ABI, functionName: 'name', address: addr }),
            client.readContract({ abi: ERC20_ABI, functionName: 'symbol', address: addr }),
            client.readContract({ abi: ERC20_ABI, functionName: 'decimals', address: addr }),
        ])
        return { name: name as string, symbol: symbol as string, decimals: decimals as number }
    } catch {
        return { name: '', symbol: '', decimals: 18 }
    }
}

export async function readV3PoolImmutables(
    chainId: number,
    address: string
): Promise<{ token0: string; token1: string; fee: number; tickSpacing: number } | null> {
    const client = getClient(chainId)
    const addr = address as `0x${string}`
    try {
        const [token0, token1, fee, tickSpacing] = await Promise.all([
            client.readContract({
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'token0',
                address: addr,
            }),
            client.readContract({
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'token1',
                address: addr,
            }),
            client.readContract({ abi: UNISWAP_V3_POOL_ABI, functionName: 'fee', address: addr }),
            client.readContract({
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'tickSpacing',
                address: addr,
            }),
        ])
        return {
            token0: (token0 as string).toLowerCase(),
            token1: (token1 as string).toLowerCase(),
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
        }
    } catch {
        return null
    }
}

export async function readPosition(
    chainId: number,
    tokenId: bigint
): Promise<{
    token0: string
    token1: string
    fee: number
    tickLower: number
    tickUpper: number
} | null> {
    const manager = getV3Config(chainId, 'junoswap')?.positionManager
    if (!manager) return null
    const client = getClient(chainId)
    try {
        const pos = (await client.readContract({
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: 'positions',
            address: manager,
            args: [tokenId],
        })) as readonly [bigint, string, string, string, number, number, number, ...unknown[]]
        return {
            token0: pos[2],
            token1: pos[3],
            fee: Number(pos[4]),
            tickLower: Number(pos[5]),
            tickUpper: Number(pos[6]),
        }
    } catch {
        return null
    }
}

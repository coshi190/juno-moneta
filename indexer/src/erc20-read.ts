import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'

export async function readERC20Metadata(
    client: any,
    address: string
): Promise<{ name: string; symbol: string; decimals: number }> {
    const addr = address as `0x${string}`

    try {
        const [name, symbol, decimals] = await Promise.all([
            client.readContract({
                abi: getAbi('erc20'),
                functionName: 'name',
                address: addr,
                cache: 'immutable',
            }),
            client.readContract({
                abi: getAbi('erc20'),
                functionName: 'symbol',
                address: addr,
                cache: 'immutable',
            }),
            client.readContract({
                abi: getAbi('erc20'),
                functionName: 'decimals',
                address: addr,
                cache: 'immutable',
            }),
        ])
        return { name: name as string, symbol: symbol as string, decimals: decimals as number }
    } catch {
        return { name: '', symbol: '', decimals: 18 }
    }
}

export async function readPosition(
    client: any,
    chainId: number,
    tokenId: bigint
): Promise<{
    token0: string
    token1: string
    fee: number
    tickLower: number
    tickUpper: number
} | null> {
    const manager = getDexes(chainId, 'v3').find((dex) => dex.dexId === 'junoswap')?.positionManager
    if (!manager) return null
    try {
        const pos = (await client.readContract({
            abi: getAbi('positionManager'),
            functionName: 'positions',
            address: manager,
            args: [tokenId],
            cache: 'immutable',
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

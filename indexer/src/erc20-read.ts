import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'

export async function readERC20Metadata(
    client: any,
    address: string
): Promise<{ name: string; symbol: string; decimals: number }> {
    const read = (functionName: string, retryEmptyResponse: boolean) =>
        client.readContract({
            abi: getAbi('erc20'),
            functionName,
            address: address as `0x${string}`,
            cache: 'immutable',
            retryEmptyResponse,
        })

    /* name and symbol are optional in ERC-20, so an empty reply is final; decimals keeps
     * Ponder's retries because a wrong value would skew every amount for the token. */
    const [name, symbol, decimals] = await Promise.allSettled([
        read('name', false),
        read('symbol', false),
        read('decimals', true),
    ])
    return {
        name: name.status === 'fulfilled' ? (name.value as string) : '',
        symbol: symbol.status === 'fulfilled' ? (symbol.value as string) : '',
        decimals: decimals.status === 'fulfilled' ? Number(decimals.value) : 18,
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

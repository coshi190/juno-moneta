export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function addLiquidity(current: string, delta: bigint): string {
    return (BigInt(current) + delta).toString()
}

export function subLiquidity(current: string, delta: bigint): string {
    const next = BigInt(current) - delta
    return (next < 0n ? 0n : next).toString()
}

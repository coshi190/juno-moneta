export interface PricePoint {
    timestamp: number
    price: number
}

export const MAX_NATIVE_USD_PRICE = 1e6
export const MAX_TOKEN_USD_PRICE = 1e12

export function sanitizeUsdPrice(value: number, maxPrice: number): number | null {
    return Number.isFinite(value) && value > 0 && value <= maxPrice ? value : null
}

export function parseTokenUsdPrice(raw: string | null | undefined): number | null {
    return raw ? sanitizeUsdPrice(parseFloat(raw), MAX_TOKEN_USD_PRICE) : null
}

export function sanitizePricePoints(points: readonly PricePoint[]): PricePoint[] {
    const finite = points.filter((p) => Number.isFinite(p.price) && p.price > 0)
    const median = Float64Array.from(finite, (p) => p.price).sort()[finite.length >> 1]!
    return finite
        .filter((p) => p.price <= median * 100 && p.price >= median / 100)
        .sort((a, b) => a.timestamp - b.timestamp)
}

export function makePriceAt(points: PricePoint[], fallback: number): (timestamp: number) => number {
    if (points.length === 0) return () => fallback
    return (timestamp) => {
        let lo = 0
        let hi = points.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (points[mid]!.timestamp <= timestamp) lo = mid + 1
            else hi = mid
        }
        return points[Math.max(lo - 1, 0)]!.price
    }
}

export function computePriceFromSqrtPriceX96(
    sqrtPriceX96: bigint,
    tokenIsToken0: boolean,
    tokenDecimals: number,
    pairedDecimals: number
): number {
    if (sqrtPriceX96 <= 0n) return 0
    const ratio = (Number(sqrtPriceX96) / 2 ** 96) ** 2
    return (tokenIsToken0 ? ratio : 1 / ratio) * 10 ** (tokenDecimals - pairedDecimals)
}

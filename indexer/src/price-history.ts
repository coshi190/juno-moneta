export interface NativePricePoint {
    timestamp: number
    price: number
}

export const MAX_NATIVE_USD_PRICE = 1e6
export const MAX_TOKEN_USD_PRICE = 1e12

export function sanitizeUsdPrice(value: number, maxPrice: number): number | null {
    return Number.isFinite(value) && value > 0 && value <= maxPrice ? value : null
}

export function sanitizePricePoints<T extends { price: number }>(points: readonly T[]): T[] {
    const finite = points.filter((p) => Number.isFinite(p.price) && p.price > 0)
    if (finite.length === 0) return []
    const sorted = finite.map((p) => p.price).sort((a, b) => a - b)
    const median = sorted[sorted.length >> 1]!
    return finite.filter((p) => p.price <= median * 100 && p.price >= median / 100)
}

export function makePriceAt(
    points: NativePricePoint[],
    fallbackPrice: number | null
): (timestamp: number) => number {
    const fallback = fallbackPrice ?? 0
    if (points.length === 0) return () => fallback

    return (timestamp: number) => {
        if (timestamp < points[0]!.timestamp) return points[0]!.price
        let lo = 0
        let hi = points.length - 1
        let ans = 0
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (points[mid]!.timestamp <= timestamp) {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return points[ans]!.price
    }
}

const Q96 = 2n ** 96n

export function computePriceFromSqrtPriceX96(
    sqrtPriceX96: bigint,
    tokenIsToken0: boolean,
    tokenDecimals: number,
    pairedDecimals: number
): number {
    if (sqrtPriceX96 <= 0n) return 0
    const SCALE = 10n ** 18n
    let scaled: bigint
    if (tokenIsToken0) {
        scaled = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96)
    } else {
        scaled = (Q96 * Q96 * SCALE) / (sqrtPriceX96 * sqrtPriceX96)
    }
    const diff = tokenDecimals - pairedDecimals
    if (diff > 0) {
        scaled = scaled * 10n ** BigInt(diff)
    } else if (diff < 0) {
        scaled = scaled / 10n ** BigInt(-diff)
    }
    return Number(scaled) / 1e18
}

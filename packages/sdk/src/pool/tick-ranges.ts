import { MAX_TICK, MIN_TICK, nearestUsableTick } from './tick-math.js'

const FULL_RANGE_TOLERANCE = 256

export interface TickRange {
    tickLower: number
    tickUpper: number
}

export function snapTickRange(
    tickLower: number,
    tickUpper: number,
    tickSpacing: number
): TickRange {
    const snappedLower = nearestUsableTick(tickLower, tickSpacing)
    let snappedUpper = nearestUsableTick(tickUpper, tickSpacing)
    if (snappedUpper <= snappedLower) snappedUpper = snappedLower + tickSpacing
    return { tickLower: snappedLower, tickUpper: snappedUpper }
}

export function getFullRange(tickSpacing: number): TickRange {
    return {
        tickLower: nearestUsableTick(MIN_TICK, tickSpacing),
        tickUpper: nearestUsableTick(MAX_TICK, tickSpacing),
    }
}

export function isFullRange(tickLower: number, tickUpper: number, tolerance?: number): boolean {
    const slack = tolerance ?? FULL_RANGE_TOLERANCE
    return tickLower <= MIN_TICK + slack && tickUpper >= MAX_TICK - slack
}

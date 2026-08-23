import { describe, it, expect } from 'vitest'
import * as sdk from '../index'

const REMOVED = [
    'tickToSqrtPriceX96',
    'sqrtPriceX96ToTick',
    'priceToTick',
    'priceToSqrtPriceX96',
    'nearestUsableTick',
    'MIN_SQRT_RATIO',
    'getAmountsForLiquidity',
    'getLiquidityForAmount0',
    'getLiquidityForAmount1',
    'getAmount0ForLiquidity',
    'getAmount1ForLiquidity',
    'calculateAmount1FromAmount0',
    'calculateAmount0FromAmount1',
    'calculateMinAmounts',
    'calculateDeadline',
    'bigIntSqrt',
    'priceFromSqrtPriceX96',
    'computeTvlUsd',
    'computeTvlFromPrices',
    'computePoolTvlUsd',
    'deriveNativeUsdPrice',
    'computeVolumeUsd',
    'computeVolumeFromPrices',
    'computePoolVolumesUsd',
    'getPresetTickRange',
    'getRangePercentages',
    'getRangeViewport',
    'formatFeeTier',
    'foldPositions',
    'buildPositionPoolKeys',
    'buildPoolAddressCalls',
    'decodePoolAddresses',
    'buildPoolStateCalls',
    'decodePoolStates',
    'getPositionPoolKey',
    'fetchV3PoolTvlDays',
    'fetchTokenList',
    'fetchCreatedTokens',
    'fetchCreatorSnapshots',
    'fetchGraduatedTokens',
    'fetchBondingCurveTokens',
    'fetchLaunchTokenMeta',
    'fetchLaunchTokensByAddresses',
    'fetchTokenSnapshotsByAddresses',
    'fetchHolderBalances',
    'fetchAllTokenHolders',
    'fetchLaunchTokenOg',
]

const EXPOSED = [
    'getTickSpacing',
    'getFeeTierInfo',
    'listFeeTiers',
    'computePoolPrice',
    'computeTickPrice',
    'getTickForPrice',
    'getPoolDisplayOrder',
    'invertSqrtPriceX96',
    'snapTickRange',
    'isFullRange',
    'getFullRange',
    'fetchPositions',
    'computePositionValueUsd',
    'computeDependentAmount',
    'computeInitialSqrtPriceX96',
    'planAddLiquidity',
    'planIncreaseLiquidity',
    'planRemoveLiquidity',
    'fetchPoolMetrics',
    'computeFeeAprPercent',
    'sortTokens',
    'isInRange',
    'fetchLaunchTokens',
    'fetchTokenSnapshots',
    'fetchTokenHolders',
]

const surface = sdk as unknown as Record<string, unknown>

describe('sdk public surface', () => {
    it.each(REMOVED)('no longer exports the raw primitive %s', (name) => {
        expect(surface[name]).toBeUndefined()
    })

    it.each(EXPOSED)('exports the high level function %s', (name) => {
        expect(typeof surface[name]).toBe('function')
    })

    it('keeps the tick bounds as protocol constants', () => {
        expect(sdk.MIN_TICK).toBe(-887272)
        expect(sdk.MAX_TICK).toBe(887272)
    })

    it('exposes the tick spacing table', () => {
        expect(sdk.TICK_SPACING_BY_FEE[3000]).toBe(60)
    })
})

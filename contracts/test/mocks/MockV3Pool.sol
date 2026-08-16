// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../../src/interfaces/v3-core/IUniswapV3Pool.sol";

contract MockV3Pool is IUniswapV3Pool {
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    uint160 public storedSqrtPriceX96;
    bool public initialized;

    function setSlot0(uint160 _sqrtPriceX96) external {
        storedSqrtPriceX96 = _sqrtPriceX96;
    }

    function initialize(uint160 sqrtPriceX96) external {
        require(sqrtPriceX96 >= MIN_SQRT_RATIO && sqrtPriceX96 < MAX_SQRT_RATIO, "R");
        storedSqrtPriceX96 = sqrtPriceX96;
        initialized = true;
    }

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        return (storedSqrtPriceX96, 0, 0, 0, 0, 0, true);
    }

    function feeGrowthGlobal0X128() external pure returns (uint256) {
        return 0;
    }

    function feeGrowthGlobal1X128() external pure returns (uint256) {
        return 0;
    }

    function protocolFees() external pure returns (uint128, uint128) {
        return (0, 0);
    }

    function liquidity() external pure returns (uint128) {
        return 0;
    }

    function ticks(int24)
        external
        pure
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128,
            int56 tickCumulativeOutside,
            uint160 secondsPerLiquidityOutsideX128,
            uint32 secondsOutside,
            bool isInitialized
        )
    {
        return (0, 0, 0, 0, 0, 0, 0, false);
    }

    function tickBitmap(int16) external pure returns (uint256) {
        return 0;
    }

    function positions(bytes32) external pure returns (uint128, uint256, uint256, uint128, uint128) {
        return (0, 0, 0, 0, 0);
    }

    function observations(uint256)
        external
        pure
        returns (
            uint32 blockTimestamp,
            int56 tickCumulative,
            uint160 secondsPerLiquidityCumulativeX128,
            bool isInitialized
        )
    {
        return (0, 0, 0, false);
    }

    function factory() external pure returns (address) {
        return address(0);
    }

    function token0() external pure returns (address) {
        return address(0);
    }

    function token1() external pure returns (address) {
        return address(0);
    }

    function fee() external pure returns (uint24) {
        return 0;
    }

    function tickSpacing() external pure returns (int24) {
        return 0;
    }

    function maxLiquidityPerTick() external pure returns (uint128) {
        return 0;
    }

    function observe(uint32[] calldata)
        external
        pure
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        int56[] memory tc = new int56[](0);
        uint160[] memory sp = new uint160[](0);
        return (tc, sp);
    }

    function snapshotCumulativesInside(int24, int24)
        external
        pure
        returns (int56 tickCumulativeInside, uint160 secondsPerLiquidityInsideX128, uint32 secondsInside)
    {
        return (0, 0, 0);
    }

    function mint(address, int24, int24, uint128, bytes calldata) external pure returns (uint256, uint256) {
        return (0, 0);
    }

    function collect(address, int24, int24, uint128, uint128) external pure returns (uint128, uint128) {
        return (0, 0);
    }

    function burn(int24, int24, uint128) external pure returns (uint256, uint256) {
        return (0, 0);
    }

    function swap(address, bool, int256, uint160, bytes calldata) external pure returns (int256, int256) {
        return (0, 0);
    }

    function flash(address, uint256, uint256, bytes calldata) external pure {}

    function increaseObservationCardinalityNext(uint16) external pure {}

    function setFeeProtocol(uint8, uint8) external pure {}

    function collectProtocol(address, uint128, uint128) external pure returns (uint128, uint128) {
        return (0, 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/Math.sol";

library V3LiquidityMath {
    uint256 internal constant Q96 = 2 ** 96;

    uint160 internal constant SQRT_RATIO_LOWER = 4310618292;
    uint160 internal constant SQRT_RATIO_UPPER = 1456195216270955103206513029158776779468408838535;

    function liquidityForAmount0(uint160 a, uint160 b, uint256 amount0) internal pure returns (uint128) {
        if (a > b) (a, b) = (b, a);
        return uint128(Math.mulDiv(amount0, Math.mulDiv(a, b, Q96), b - a));
    }

    function liquidityForAmount1(uint160 a, uint160 b, uint256 amount1) internal pure returns (uint128) {
        if (a > b) (a, b) = (b, a);
        return uint128(Math.mulDiv(amount1, Q96, b - a));
    }

    function liquidityForAmounts(uint160 p, uint160 a, uint160 b, uint256 amount0, uint256 amount1)
        internal
        pure
        returns (uint128 liquidity)
    {
        if (a > b) (a, b) = (b, a);
        if (p <= a) {
            liquidity = liquidityForAmount0(a, b, amount0);
        } else if (p < b) {
            uint128 l0 = liquidityForAmount0(p, b, amount0);
            uint128 l1 = liquidityForAmount1(a, p, amount1);
            liquidity = l0 < l1 ? l0 : l1;
        } else {
            liquidity = liquidityForAmount1(a, b, amount1);
        }
    }

    function amount0ForLiquidity(uint160 a, uint160 b, uint128 liquidity) internal pure returns (uint256) {
        if (a > b) (a, b) = (b, a);
        return Math.mulDiv(uint256(liquidity) << 96, b - a, b) / a;
    }

    function amount1ForLiquidity(uint160 a, uint160 b, uint128 liquidity) internal pure returns (uint256) {
        if (a > b) (a, b) = (b, a);
        return Math.mulDiv(liquidity, b - a, Q96);
    }

    function amountsForLiquidity(uint160 p, uint160 a, uint160 b, uint128 liquidity)
        internal
        pure
        returns (uint256 amount0, uint256 amount1)
    {
        if (a > b) (a, b) = (b, a);
        if (p <= a) {
            amount0 = amount0ForLiquidity(a, b, liquidity);
        } else if (p < b) {
            amount0 = amount0ForLiquidity(p, b, liquidity);
            amount1 = amount1ForLiquidity(a, p, liquidity);
        } else {
            amount1 = amount1ForLiquidity(a, b, liquidity);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../../src/interfaces/v3-core/IUniswapV3Factory.sol";
import "./MockV3Pool.sol";

contract MockV3Factory is IUniswapV3Factory {
    address public mockPool;
    mapping(bytes32 => address) public pools;

    function setMockPool(address _pool) external {
        mockPool = _pool;
    }

    function _key(address tokenA, address tokenB, uint24 fee) internal pure returns (bytes32) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encodePacked(token0, token1, fee));
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        return pools[_key(tokenA, tokenB, fee)];
    }

    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool) {
        require(tokenA != tokenB, "identical addresses");
        require(tokenA != address(0) && tokenB != address(0), "zero address");
        bytes32 key = _key(tokenA, tokenB, fee);
        require(pools[key] == address(0), "pool exists");

        if (mockPool != address(0)) {
            pool = mockPool;
            mockPool = address(0);
        } else {
            pool = address(new MockV3Pool());
        }
        pools[key] = pool;
    }

    function owner() external pure returns (address) {
        return address(0);
    }

    function feeAmountTickSpacing(uint24) external pure returns (int24) {
        return 0;
    }

    function setOwner(address) external pure {}

    function enableFeeAmount(uint24, int24) external pure {}
}

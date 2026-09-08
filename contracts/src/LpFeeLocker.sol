// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "./interfaces/v3-periphery/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ILockerFeeCollector {
    function curve() external view returns (address);
    function lpLocker() external view returns (address);
    function collectAsset(address tokenAddr, address creator, address asset, uint256 amount) external;
}

interface ILockerCurve {
    function creatorOf(address tokenAddr) external view returns (address);
}

contract LpFeeLocker {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager public immutable posManager;
    address public immutable feeCollector;
    address public immutable curve;
    address public immutable wrappedNative;

    event LpFeesCollected(
        uint256 indexed tokenId,
        address indexed tokenAddr,
        address indexed creator,
        uint256 amount0,
        uint256 amount1
    );

    constructor(address _feeCollector, address _posManager) {
        require(_feeCollector.code.length > 0, "invalid fee collector");
        require(_posManager != address(0), "invalid pos manager");
        address _wrappedNative = INonfungiblePositionManager(_posManager).WETH9();
        require(_wrappedNative != address(0), "invalid wrapped native");
        address _curve = ILockerFeeCollector(_feeCollector).curve();
        require(_curve != address(0), "invalid curve");
        require(
            ILockerFeeCollector(_feeCollector).lpLocker() == address(this),
            "collector locker mismatch"
        );
        feeCollector = _feeCollector;
        curve = _curve;
        posManager = INonfungiblePositionManager(_posManager);
        wrappedNative = _wrappedNative;
    }

    function collect(uint256 _tokenId) external returns (uint256 amount0, uint256 amount1) {
        (,, address token0, address token1,,,,,,,,) = posManager.positions(_tokenId);
        (amount0, amount1) = posManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: _tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        address tokenAddr = token0 == wrappedNative ? token1 : token0;
        address creator = ILockerCurve(curve).creatorOf(tokenAddr);

        emit LpFeesCollected(_tokenId, tokenAddr, creator, amount0, amount1);

        _forward(tokenAddr, creator, token0, amount0);
        _forward(tokenAddr, creator, token1, amount1);
    }

    function _forward(address _tokenAddr, address _creator, address _asset, uint256 _amount) private {
        if (_amount == 0) return;
        IERC20(_asset).forceApprove(feeCollector, _amount);
        ILockerFeeCollector(feeCollector).collectAsset(_tokenAddr, _creator, _asset, _amount);
    }
}

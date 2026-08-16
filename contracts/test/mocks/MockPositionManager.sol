// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
pragma abicoder v2;

import "../../src/interfaces/v3-periphery/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockPositionManager is INonfungiblePositionManager {
    INonfungiblePositionManager.MintParams public lastMintParams;
    uint256 public mintCallCount;

    address public wrappedNative;
    bool public partialFill;
    uint256 public nativeUsed;
    uint256 public tokenUsed;
    uint256 internal ethToRefund;

    function setWrappedNative(address _wrappedNative) external {
        wrappedNative = _wrappedNative;
    }

    function setPartialFill(uint256 _nativeUsed, uint256 _tokenUsed) external {
        partialFill = true;
        nativeUsed = _nativeUsed;
        tokenUsed = _tokenUsed;
    }

    function mint(INonfungiblePositionManager.MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        lastMintParams = params;
        mintCallCount++;

        bool token0IsNative = params.token0 == wrappedNative;
        uint256 usedNative = partialFill ? nativeUsed : (token0IsNative ? params.amount0Desired : params.amount1Desired);
        uint256 usedToken = partialFill ? tokenUsed : (token0IsNative ? params.amount1Desired : params.amount0Desired);

        address launchToken = token0IsNative ? params.token1 : params.token0;
        IERC20(launchToken).transferFrom(msg.sender, address(this), usedToken);

        ethToRefund = msg.value - usedNative;

        amount0 = token0IsNative ? usedNative : usedToken;
        amount1 = token0IsNative ? usedToken : usedNative;
        return (1, 0, amount0, amount1);
    }

    function positions(uint256)
        external
        pure
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        return (0, address(0), address(0), address(0), 0, 0, 0, 0, 0, 0, 0, 0);
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        return (0, 0, 0);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        return (0, 0);
    }

    function collect(CollectParams calldata) external payable returns (uint256 amount0, uint256 amount1) {
        return (0, 0);
    }

    function burn(uint256) external payable {}

    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address) {
        return address(0);
    }

    function unwrapWETH9(uint256, address) external payable {}

    function refundETH() external payable {
        uint256 amt = ethToRefund;
        ethToRefund = 0;
        if (amt > 0) {
            (bool ok,) = msg.sender.call{value: amt}("");
            require(ok, "refund failed");
        }
    }

    function sweepToken(address, uint256, address) external payable {}

    function factory() external pure returns (address) {
        return address(0);
    }

    function WETH9() external pure returns (address) {
        return address(0);
    }

    function name() external pure returns (string memory) {
        return "";
    }

    function symbol() external pure returns (string memory) {
        return "";
    }

    function tokenURI(uint256) external pure returns (string memory) {
        return "";
    }

    function totalSupply() external pure returns (uint256) {
        return 0;
    }

    function tokenOfOwnerByIndex(address, uint256) external pure returns (uint256) {
        return 0;
    }

    function tokenByIndex(uint256) external pure returns (uint256) {
        return 0;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    function ownerOf(uint256) external pure returns (address) {
        return address(0);
    }

    function safeTransferFrom(address, address, uint256) external pure {}

    function transferFrom(address, address, uint256) external pure {}

    function approve(address, uint256) external pure {}

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function setApprovalForAll(address, bool) external pure {}

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {}

    function supportsInterface(bytes4) external pure returns (bool) {
        return false;
    }

    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);
            require(success, "MockPositionManager: multicall failed");
            results[i] = result;
        }
    }
}

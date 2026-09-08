// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
pragma abicoder v2;

import "../../src/interfaces/v3-periphery/INonfungiblePositionManager.sol";
import "../../src/interfaces/v3-core/IUniswapV3Factory.sol";
import "../../src/interfaces/v3-core/IUniswapV3Pool.sol";
import "../../src/interfaces/IWETH9.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./V3LiquidityMath.sol";

contract MockPositionManager is INonfungiblePositionManager {
    INonfungiblePositionManager.MintParams public lastMintParams;
    uint256 public mintCallCount;
    uint256 public lastAmount0;
    uint256 public lastAmount1;

    address public wrappedNative;
    address public poolFactory;
    uint256 public nextTokenId = 1;

    struct Position {
        address token0;
        address token1;
        uint128 liquidity;
        uint128 owed0;
        uint128 owed1;
    }

    mapping(uint256 => Position) internal _positions;
    mapping(uint256 => address) internal _owners;
    mapping(address => uint256) internal _balances;

    bool public partialFill;
    uint256 public nativeUsed;
    uint256 public tokenUsed;

    function setWrappedNative(address _wrappedNative) external {
        wrappedNative = _wrappedNative;
    }

    function setPoolFactory(address _factory) external {
        poolFactory = _factory;
    }

    function setPartialFill(uint256 _nativeUsed, uint256 _tokenUsed) external {
        partialFill = true;
        nativeUsed = _nativeUsed;
        tokenUsed = _tokenUsed;
    }

    function setPendingFees(uint256 _tokenId, uint128 _amount0, uint128 _amount1) external {
        _positions[_tokenId].owed0 = _amount0;
        _positions[_tokenId].owed1 = _amount1;
    }

    function mint(INonfungiblePositionManager.MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        lastMintParams = params;
        mintCallCount++;

        bool token0IsNative = params.token0 == wrappedNative;

        if (partialFill) {
            amount0 = token0IsNative ? nativeUsed : tokenUsed;
            amount1 = token0IsNative ? tokenUsed : nativeUsed;
        } else if (poolFactory != address(0)) {
            (amount0, amount1) = _amountsAtPoolPrice(params);
            require(amount0 >= params.amount0Min && amount1 >= params.amount1Min, "Price slippage check");
        } else {
            amount0 = params.amount0Desired;
            amount1 = params.amount1Desired;
        }

        lastAmount0 = amount0;
        lastAmount1 = amount1;

        tokenId = nextTokenId++;
        liquidity = 1e18;
        _positions[tokenId] =
            Position({token0: params.token0, token1: params.token1, liquidity: liquidity, owed0: 0, owed1: 0});
        _owners[tokenId] = params.recipient;
        _balances[params.recipient]++;

        uint256 usedNative = token0IsNative ? amount0 : amount1;
        uint256 usedToken = token0IsNative ? amount1 : amount0;

        address launchToken = token0IsNative ? params.token1 : params.token0;
        IERC20(launchToken).transferFrom(msg.sender, address(this), usedToken);

        IWETH9(wrappedNative).deposit{value: usedNative}();

        return (tokenId, liquidity, amount0, amount1);
    }

    function _amountsAtPoolPrice(INonfungiblePositionManager.MintParams calldata params)
        internal
        view
        returns (uint256 amount0, uint256 amount1)
    {
        require(params.tickLower == -887200 && params.tickUpper == 887200, "mock: full range only");
        address pool = IUniswapV3Factory(poolFactory).getPool(params.token0, params.token1, params.fee);
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();

        uint128 liq = V3LiquidityMath.liquidityForAmounts(
            sqrtPriceX96,
            V3LiquidityMath.SQRT_RATIO_LOWER,
            V3LiquidityMath.SQRT_RATIO_UPPER,
            params.amount0Desired,
            params.amount1Desired
        );
        (amount0, amount1) = V3LiquidityMath.amountsForLiquidity(
            sqrtPriceX96, V3LiquidityMath.SQRT_RATIO_LOWER, V3LiquidityMath.SQRT_RATIO_UPPER, liq
        );
    }

    function positions(uint256 tokenId)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)
    {
        Position memory pos = _positions[tokenId];
        return (0, address(0), pos.token0, pos.token1, 10000, -887200, 887200, pos.liquidity, 0, 0, pos.owed0, pos.owed1);
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

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        require(_owners[params.tokenId] == msg.sender, "Not approved");
        Position memory pos = _positions[params.tokenId];

        amount0 = pos.owed0 > params.amount0Max ? params.amount0Max : pos.owed0;
        amount1 = pos.owed1 > params.amount1Max ? params.amount1Max : pos.owed1;

        _positions[params.tokenId].owed0 = pos.owed0 - uint128(amount0);
        _positions[params.tokenId].owed1 = pos.owed1 - uint128(amount1);

        if (amount0 > 0) IERC20(pos.token0).transfer(params.recipient, amount0);
        if (amount1 > 0) IERC20(pos.token1).transfer(params.recipient, amount1);
    }

    function burn(uint256) external payable {}

    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address) {
        return address(0);
    }

    function unwrapWETH9(uint256, address) external payable {}

    function refundETH() external payable {
        uint256 amt = address(this).balance;
        if (amt > 0) {
            (bool ok,) = msg.sender.call{value: amt}("");
            require(ok, "refund failed");
        }
    }

    function sweepToken(address, uint256, address) external payable {}

    function factory() external view returns (address) {
        return poolFactory;
    }

    function WETH9() external view returns (address) {
        return wrappedNative;
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

    function balanceOf(address owner) external view returns (uint256) {
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
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

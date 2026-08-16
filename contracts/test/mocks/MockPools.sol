// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../src/interfaces/IUniswapV2Pair.sol";
import "../../src/interfaces/IUniswapV3SwapCallback.sol";

contract MintableERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract FeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBps;

    constructor(uint256 _feeBps) ERC20("FoT", "FOT") {
        feeBps = _feeBps;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function _transfer(address from, address to, uint256 amt) internal override {
        uint256 fee = (amt * feeBps) / 10000;
        super._transfer(from, to, amt - fee);
        if (fee > 0) _burn(from, fee);
    }
}

contract MockWETH9 is ERC20 {
    constructor() ERC20("Wrapped Native", "WNATIVE") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amt) external {
        _burn(msg.sender, amt);
        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "withdraw failed");
    }
}

contract KycWETH9 is ERC20 {
    constructor() ERC20("KYC Wrapped Native", "KWNATIVE") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256) external pure {
        revert("kyc required");
    }
}

contract MockV2Pair is IUniswapV2Pair {
    address public override token0;
    address public override token1;
    uint16 public immutable feeBps;

    uint112 private _reserve0;
    uint112 private _reserve1;

    constructor(address tokenA, address tokenB, uint16 _feeBps) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        feeBps = _feeBps;
    }

    function getReserves() external view override returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, 0);
    }

    function sync() public {
        _reserve0 = uint112(IERC20(token0).balanceOf(address(this)));
        _reserve1 = uint112(IERC20(token1).balanceOf(address(this)));
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external override {
        require(amount0Out > 0 || amount1Out > 0, "V2: IOA");
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "V2: IL");

        if (amount0Out > 0) IERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).transfer(to, amount1Out);

        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 in0 = bal0 > _reserve0 - amount0Out ? bal0 - (_reserve0 - amount0Out) : 0;
        uint256 in1 = bal1 > _reserve1 - amount1Out ? bal1 - (_reserve1 - amount1Out) : 0;
        require(in0 > 0 || in1 > 0, "V2: IIA");

        uint256 adj0 = bal0 * 10000 - in0 * feeBps;
        uint256 adj1 = bal1 * 10000 - in1 * feeBps;
        require(adj0 * adj1 >= uint256(_reserve0) * uint256(_reserve1) * (10000 ** 2), "V2: K");

        _reserve0 = uint112(bal0);
        _reserve1 = uint112(bal1);
    }
}

contract MockV2PairNoData is IUniswapV2PairNoData {
    address public token0;
    address public token1;
    uint16 public immutable feeBps;

    uint112 private _reserve0;
    uint112 private _reserve1;

    constructor(address tokenA, address tokenB, uint16 _feeBps) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        feeBps = _feeBps;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, 0);
    }

    function sync() public {
        _reserve0 = uint112(IERC20(token0).balanceOf(address(this)));
        _reserve1 = uint112(IERC20(token1).balanceOf(address(this)));
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external override {
        require(amount0Out > 0 || amount1Out > 0, "V2: IOA");
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "V2: IL");

        if (amount0Out > 0) IERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).transfer(to, amount1Out);

        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 in0 = bal0 > _reserve0 - amount0Out ? bal0 - (_reserve0 - amount0Out) : 0;
        uint256 in1 = bal1 > _reserve1 - amount1Out ? bal1 - (_reserve1 - amount1Out) : 0;
        require(in0 > 0 || in1 > 0, "V2: IIA");

        uint256 adj0 = bal0 * 10000 - in0 * feeBps;
        uint256 adj1 = bal1 * 10000 - in1 * feeBps;
        require(adj0 * adj1 >= uint256(_reserve0) * uint256(_reserve1) * (10000 ** 2), "V2: K");

        _reserve0 = uint112(bal0);
        _reserve1 = uint112(bal1);
    }
}

contract MockV2Factory {
    mapping(address => mapping(address => address)) private _pairs;

    function getPair(address tokenA, address tokenB) external view returns (address) {
        (address a, address b) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return _pairs[a][b];
    }

    function register(address pair) external {
        address t0 = MockV2Pair(pair).token0();
        address t1 = MockV2Pair(pair).token1();
        _pairs[t0][t1] = pair;
    }
}

contract MockV3PoolSim {
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;

    uint256 public fillBps = 10000;

    constructor(address tokenA, address tokenB, uint24 _fee) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        fee = _fee;
    }

    function setFillBps(uint256 bps) external {
        fillBps = bps;
    }

    function _callback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) internal virtual {
        IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0Delta, amount1Delta, data);
    }

    function _quote(address tout, uint256 amountIn, uint256 reserveIn) private view returns (uint256 amountOut) {
        uint256 reserveOut = IERC20(tout).balanceOf(address(this));
        uint256 inWithFee = (amountIn * (1_000_000 - fee)) / 1_000_000;
        amountOut = (inWithFee * reserveOut) / (reserveIn + inWithFee);
        require(amountOut > 0, "V3: zero out");
    }

    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1)
    {
        require(amountSpecified > 0, "V3: exact-in only");
        uint256 amountIn = (uint256(amountSpecified) * fillBps) / 10000;

        (address tin, address tout) = zeroForOne ? (token0, token1) : (token1, token0);
        uint256 reserveIn = IERC20(tin).balanceOf(address(this));
        uint256 amountOut = _quote(tout, amountIn, reserveIn);

        IERC20(tout).transfer(recipient, amountOut);

        (amount0, amount1) =
            zeroForOne ? (int256(amountIn), -int256(amountOut)) : (-int256(amountOut), int256(amountIn));

        _callback(amount0, amount1, data);
        require(IERC20(tin).balanceOf(address(this)) >= reserveIn + amountIn, "V3: IIA");
    }
}

contract PancakeMockV3Pool is MockV3PoolSim {
    constructor(address a, address b, uint24 f) MockV3PoolSim(a, b, f) {}

    function _callback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) internal override {
        IPancakeV3SwapCallback(msg.sender).pancakeV3SwapCallback(amount0Delta, amount1Delta, data);
    }
}

contract KublerxMockV3Pool is MockV3PoolSim {
    constructor(address a, address b, uint24 f) MockV3PoolSim(a, b, f) {}

    function _callback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) internal override {
        IKublerxSwapCallback(msg.sender).kublerxSwapCallback(amount0Delta, amount1Delta, data);
    }
}

contract RenamedCallbackMockV3Pool is MockV3PoolSim {
    constructor(address a, address b, uint24 f) MockV3PoolSim(a, b, f) {}

    function _callback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) internal override {
        (bool ok,) = msg.sender.call(
            abi.encodeWithSignature("someFutureV3SwapCallback(int256,int256,bytes)", amount0Delta, amount1Delta, data)
        );
        require(ok, "V3: callback failed");
    }
}

contract CallbackReenterer {
    function poke(address router, bytes calldata data) external {
        IUniswapV3SwapCallback(router).uniswapV3SwapCallback(int256(1), int256(0), data);
    }
}

contract AttackingV3Pool is MockV3PoolSim {
    CallbackReenterer public immutable reenterer;
    bool public attackReverted;

    constructor(address a, address b, uint24 f) MockV3PoolSim(a, b, f) {
        reenterer = new CallbackReenterer();
    }

    function _callback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) internal override {
        (bool ok,) = address(reenterer).call(abi.encodeWithSelector(CallbackReenterer.poke.selector, msg.sender, data));
        attackReverted = !ok;
        super._callback(amount0Delta, amount1Delta, data);
    }
}

contract MockV3FactorySim {
    mapping(address => mapping(address => mapping(uint24 => address))) private _pools;

    function getPool(address tokenA, address tokenB, uint24 _fee) external view returns (address) {
        (address a, address b) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return _pools[a][b][_fee];
    }

    function register(address pool) external {
        address t0 = MockV3PoolSim(pool).token0();
        address t1 = MockV3PoolSim(pool).token1();
        _pools[t0][t1][MockV3PoolSim(pool).fee()] = pool;
    }
}

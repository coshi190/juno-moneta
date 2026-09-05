// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "./ERC20Token.sol";
import "./interfaces/v3-core/IUniswapV3Factory.sol";
import "./interfaces/v3-core/IUniswapV3Pool.sol";
import "./interfaces/v3-periphery/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IFeeCollector {
    function collectNative(address tokenAddr, address creator) external payable;
    function collectToken(address tokenAddr, address creator, uint256 amount) external;
}

contract JunoBondingCurveV1_1 {
    struct PumpReserve {
        uint256 native;
        uint256 token;
    }
    mapping(address => PumpReserve) public pumpReserve;

    address public immutable feeCollector;
    uint256 public createFee;
    uint256 public pumpFee;
    uint256 public constant INITIALTOKEN = 1000000000 ether;
    uint256 public constant initialNative = 0;
    uint256 public immutable virtualAmount;
    uint256 public immutable graduationAmount;
    uint256 public immutable curveReserve;

    mapping(address => bool) public isGraduate;
    IERC20 public wrappedNative;
    IUniswapV3Factory public v3factory;
    INonfungiblePositionManager public v3posManager;

    mapping(address => address) public creatorOf;

    event Swap(
        address indexed sender,
        bool indexed isBuy,
        address indexed tokenAddr,
        uint256 amountIn,
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    );
    event Creation(
        address indexed creator,
        address tokenAddr,
        string logo,
        string description,
        string link1,
        string link2,
        string link3,
        uint256 createdTime
    );
    event Graduation(
        address indexed sender,
        address tokenAddr
    );
    
    constructor (
        address _wrappedNative,
        address _v3factory,
        address _v3posManager,
        address _feeCollector,
        uint256 _virtualAmount,
        uint256 _graduationAmount
    ) {
        require(_virtualAmount > 0 && _graduationAmount > 0, "invalid curve state");
        require(_feeCollector != address(0), "invalid fee collector");
        wrappedNative = IERC20(_wrappedNative);
        v3factory = IUniswapV3Factory(_v3factory);
        v3posManager = INonfungiblePositionManager(_v3posManager);
        feeCollector = _feeCollector;
        virtualAmount = _virtualAmount;
        graduationAmount = _graduationAmount;
        uint256 total = _virtualAmount + _graduationAmount;
        curveReserve = Math.mulDiv(
            INITIALTOKEN, total * total, total * total - _virtualAmount * _virtualAmount
        );
    }

    receive() external payable {
        require(msg.sender == address(v3posManager), "only posManager");
    }

    function setFee(uint256 _createFee, uint256 _pumpFee) external returns (bool) {
        require(msg.sender == feeCollector);
        require(_pumpFee <= 500, "fee too high");
        require(_createFee <= 10 ether, "create fee too high");
        createFee = _createFee;
        pumpFee = _pumpFee;
        return true;
    }

    function createToken(
        string memory _name,
        string memory _symbol,
        string memory _logo,
        string memory _description,
        string memory _link1,
        string memory _link2,
        string memory _link3
    ) external payable returns (address) {
        require(msg.value == createFee, "insufficient creation cost");

        ERC20Token newtoken = new ERC20Token(_name, _symbol, INITIALTOKEN);
        pumpReserve[address(newtoken)].token = curveReserve;
        creatorOf[address(newtoken)] = msg.sender;

        emit Creation(
            msg.sender,
            address(newtoken),
            _logo,
            _description,
            _link1,
            _link2,
            _link3,
            block.timestamp
        );

        _sendNative(feeCollector, createFee);
        return (address(newtoken));
    }

    function graduate(address _tokenAddr) external returns (bool) {
        require(!isGraduate[_tokenAddr], "token already graduated");
        require(pumpReserve[_tokenAddr].native >= graduationAmount, "not reach graduation cap");

        isGraduate[_tokenAddr] = true;
        (address _tkn0, address _tkn1) = _tokenAddr < address(wrappedNative) ? 
            (_tokenAddr, address(wrappedNative)) :
            (address(wrappedNative), _tokenAddr);
        uint256 _tkn0AmountToMint;
        uint256 _tkn1AmountToMint;
        {
            uint256 nativeReserve = pumpReserve[_tokenAddr].native;
            uint256 tokenLiquidity = Math.mulDiv(
                pumpReserve[_tokenAddr].token, nativeReserve, virtualAmount + nativeReserve
            );
            uint256 tokenBalance = ERC20(_tokenAddr).balanceOf(address(this));
            if (tokenLiquidity > tokenBalance) tokenLiquidity = tokenBalance;
            (_tkn0AmountToMint, _tkn1AmountToMint) = _tokenAddr < address(wrappedNative)
                ? (tokenLiquidity, nativeReserve)
                : (nativeReserve, tokenLiquidity);
        }

        // createPool/initialize are permissionless; a pre-existing pool can hold a foreign sqrtPriceX96
        // The 99% minimums below admit ~+/-100bps of skew around the curve close, under the ~260bps
        // an initialize-at-band-edge -> graduate() -> dump round trip needs to break even, so the
        // displacement to the 0xdead position is not extractable (testFork_SkewSkim_*)
        address pool = v3factory.getPool(_tkn0, _tkn1, 10000);
        if (pool == address(0)) {
            pool = v3factory.createPool(_tkn0, _tkn1, 10000);
            IUniswapV3Pool(pool).initialize(_encodeSqrtPriceX96(_tkn0AmountToMint, _tkn1AmountToMint));
        } else {
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
            if (sqrtPriceX96 == 0) {
                IUniswapV3Pool(pool).initialize(_encodeSqrtPriceX96(_tkn0AmountToMint, _tkn1AmountToMint));
            }
        }
        ERC20(_tokenAddr).approve(address(v3posManager), 2**256 - 1);
        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0: _tkn0,
                token1: _tkn1,
                fee: 10000,
                tickLower: -887200,
                tickUpper: 887200,
                amount0Desired: _tkn0AmountToMint,
                amount1Desired: _tkn1AmountToMint,
                amount0Min: (_tkn0AmountToMint * 99) / 100,
                amount1Min: (_tkn1AmountToMint * 99) / 100,
                recipient: address(0xdead),
                deadline: block.timestamp + 1 hours
            });
        uint256 nativeToSend = pumpReserve[_tokenAddr].native;
        delete pumpReserve[_tokenAddr].native;
        delete pumpReserve[_tokenAddr].token;

        (, , uint256 amt0Used, uint256 amt1Used) = v3posManager.mint{value: nativeToSend}(params);
        v3posManager.refundETH();

        uint256 tokenLeft = ERC20(_tokenAddr).balanceOf(address(this));
        if (tokenLeft > 0) {
            ERC20(_tokenAddr).transfer(address(0xdead), tokenLeft);
        }

        emit Graduation(msg.sender, _tokenAddr);

        uint256 nativeUsed = _tokenAddr < address(wrappedNative) ? amt1Used : amt0Used;
        if (nativeToSend > nativeUsed) {
            _sendNative(feeCollector, nativeToSend - nativeUsed);
        }
        return true;
    }

    function _sendNative(address _to, uint256 _amount) private {
        (bool ok, ) = payable(_to).call{value: _amount}("");
        require(ok, "native transfer failed");
    }

    function _shareFee(uint256 _nativeAmount, bytes memory _data) private {
        (bool ok, ) = payable(feeCollector).call{value: _nativeAmount}(_data);
        require(ok, "fee transfer failed");
    }

    function _encodeSqrtPriceX96(uint256 _tkn0Amount, uint256 _tkn1Amount) private pure returns (uint160) {
        return uint160(Math.sqrt(Math.mulDiv(_tkn1Amount, 2**192, _tkn0Amount)));
    }

    function getAmountOut(
        uint256 _inputAmount,
        uint256 _inputReserve,
        uint256 _outputReserve
    ) public pure returns (uint256) {
        require(_inputReserve > 0 && _outputReserve > 0, "invalid reserves");
        uint256 numerator = _outputReserve * _inputAmount;
        uint256 denominator = _inputReserve + _inputAmount;
        return numerator / denominator;
    }

    function buy(address _tokenAddr, uint256 _minToken) external payable returns (uint256) {
        require(!isGraduate[_tokenAddr], "token already graduated");
        require(pumpReserve[_tokenAddr].native < graduationAmount, "curve complete");

        uint256 feeAmount = (msg.value * pumpFee) / 10000;
        uint256 amountInAfterFee = msg.value - feeAmount;
        uint256 refund;
        {
            uint256 room = graduationAmount - pumpReserve[_tokenAddr].native;
            if (amountInAfterFee > room) {
                uint256 gross = (room * 10000) / (10000 - pumpFee);
                feeAmount = (gross * pumpFee) / 10000;
                amountInAfterFee = gross - feeAmount;
                refund = msg.value - gross;
            }
        }

        uint256 amountOut = getAmountOut(
            amountInAfterFee,
            virtualAmount + pumpReserve[_tokenAddr].native,
            pumpReserve[_tokenAddr].token
        );
        require(amountOut >= _minToken, "insufficient output amount");

        pumpReserve[_tokenAddr].native += amountInAfterFee;
        pumpReserve[_tokenAddr].token -= amountOut;

        emit Swap(
            msg.sender,
            true,
            _tokenAddr,
            amountInAfterFee,
            amountOut,
            pumpReserve[_tokenAddr].native,
            pumpReserve[_tokenAddr].token
        );

        ERC20(_tokenAddr).transfer(msg.sender, amountOut);
        _shareFee(
            feeAmount,
            abi.encodeWithSelector(IFeeCollector.collectNative.selector, _tokenAddr, creatorOf[_tokenAddr])
        );
        if (refund > 0) _sendNative(msg.sender, refund);
        return amountOut;
    }

    function sell(
        address _tokenAddr,
        uint256 _tokenSold,
        uint256 _minToken
    ) external returns (uint256) {
        require(!isGraduate[_tokenAddr], "token already graduated");

        uint256 feeAmount = (_tokenSold * pumpFee) / 10000;
        uint256 amountInAfterFee = _tokenSold - feeAmount;
        uint256 amountOut = getAmountOut(
            amountInAfterFee,
            pumpReserve[_tokenAddr].token,
            virtualAmount + pumpReserve[_tokenAddr].native
        );
        require(amountOut >= _minToken, "insufficient output amount");

        pumpReserve[_tokenAddr].token += amountInAfterFee;
        pumpReserve[_tokenAddr].native -= amountOut;

        emit Swap(
            msg.sender,
            false,
            _tokenAddr,
            amountInAfterFee,
            amountOut,
            pumpReserve[_tokenAddr].token,
            pumpReserve[_tokenAddr].native
        );

        ERC20(_tokenAddr).transferFrom(msg.sender, address(this), _tokenSold);
        ERC20(_tokenAddr).transfer(feeCollector, feeAmount);
        _shareFee(
            0,
            abi.encodeWithSelector(
                IFeeCollector.collectToken.selector, _tokenAddr, creatorOf[_tokenAddr], feeAmount
            )
        );
        _sendNative(msg.sender, amountOut);
        return amountOut;
    }
}

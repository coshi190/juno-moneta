// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/BondingCurveJunoswap.sol";
import "../src/ERC20Token.sol";
import "./mocks/MockV3Factory.sol";
import "./mocks/MockV3Pool.sol";
import "./mocks/MockPositionManager.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract BondingCurveJunoswapTest is Test {
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
    event Graduation(address indexed sender, address tokenAddr);

    BondingCurveJunoswap public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;

    address public feeCollector;
    address public alice;
    address public bob;
    address public wrappedNative;

    uint256 constant CREATE_FEE = 0.001 ether;
    uint256 constant INITIAL_NATIVE = 0.05 ether;
    uint256 constant VIRTUAL_AMOUNT = 0.5 ether;
    uint256 constant GRADUATION_AMOUNT = 0.2 ether;
    uint256 constant PUMP_FEE = 100;
    uint256 constant INITIALTOKEN = 1_000_000_000 ether;

    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    receive() external payable {}

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();

        feeCollector = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        wrappedNative = address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);

        factory.setMockPool(address(pool));
        posManager.setWrappedNative(wrappedNative);
        pump = new BondingCurveJunoswap(wrappedNative, address(factory), address(posManager));
        pump.setCurveState(INITIAL_NATIVE, VIRTUAL_AMOUNT, GRADUATION_AMOUNT);
        pump.setFee(CREATE_FEE, PUMP_FEE);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _createToken() internal returns (address) {
        return _createTokenAs(alice);
    }

    function _createTokenAs(address user) internal returns (address) {
        vm.prank(user);
        return pump.createToken{value: CREATE_FEE + INITIAL_NATIVE}(
            "TestToken", "TT", "logo", "desc", "link1", "link2", "link3"
        );
    }

    function _computeBuyOutput(uint256 msgValue, address tokenAddr) internal view returns (uint256) {
        uint256 feeAmount = (msgValue * pump.pumpFee()) / 10000;
        uint256 amountInAfterFee = msgValue - feeAmount;
        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
        return pump.getAmountOut(amountInAfterFee, pump.virtualAmount() + nativeReserve, tokenReserve);
    }

    function _computeSellOutput(uint256 tokenSold, address tokenAddr) internal view returns (uint256) {
        uint256 feeAmount = (tokenSold * pump.pumpFee()) / 10000;
        uint256 amountInAfterFee = tokenSold - feeAmount;
        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
        return pump.getAmountOut(amountInAfterFee, tokenReserve, pump.virtualAmount() + nativeReserve);
    }

    function test_RevertSetFeeCollector_NonFeeCollector() public {
        vm.prank(alice);
        vm.expectRevert();
        pump.setFeeCollector(bob);
    }

    function test_NewFeeCollectorCanCallAdminFunctions() public {
        pump.setFeeCollector(alice);

        vm.prank(alice);
        pump.setFee(0, 0);

        vm.expectRevert();
        pump.setFee(1, 1);
    }

    function test_CreateToken_SetsReserves() public {
        address tokenAddr = _createToken();
        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, INITIAL_NATIVE);
        assertEq(tokenReserve, INITIALTOKEN);
    }

    function test_CreateToken_TransfersFeeToCollector() public {
        uint256 balBefore = feeCollector.balance;
        _createToken();
        assertEq(feeCollector.balance - balBefore, CREATE_FEE);
    }

    function test_RevertCreateToken_WrongValue() public {
        vm.prank(alice);
        vm.expectRevert("insufficient creation cost");
        pump.createToken{value: CREATE_FEE + INITIAL_NATIVE - 1}("T", "T", "", "", "", "", "");

        vm.prank(alice);
        vm.expectRevert("insufficient creation cost");
        pump.createToken{value: CREATE_FEE + INITIAL_NATIVE + 1}("T", "T", "", "", "", "", "");
    }

    function test_Buy_CalculatesCorrectOutput() public {
        address tokenAddr = _createToken();
        uint256 buyAmount = 0.1 ether;

        uint256 expected = _computeBuyOutput(buyAmount, tokenAddr);

        vm.prank(alice);
        uint256 amountOut = pump.buy{value: buyAmount}(tokenAddr, 0);

        assertEq(amountOut, expected);
    }

    function test_Buy_UpdatesReserves() public {
        address tokenAddr = _createToken();
        uint256 buyAmount = 0.1 ether;

        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);

        vm.prank(alice);
        uint256 amountOut = pump.buy{value: buyAmount}(tokenAddr, 0);

        uint256 feeAmount = (buyAmount * PUMP_FEE) / 10000;
        uint256 amountInAfterFee = buyAmount - feeAmount;

        (uint256 nativeAfter, uint256 tokenAfter) = pump.pumpReserve(tokenAddr);

        assertEq(nativeAfter, nativeBefore + amountInAfterFee);
        assertEq(tokenAfter, tokenBefore - amountOut);
    }

    function test_Buy_TransfersTokensToBuyer() public {
        address tokenAddr = _createToken();
        uint256 buyAmount = 0.1 ether;

        vm.prank(alice);
        uint256 amountOut = pump.buy{value: buyAmount}(tokenAddr, 0);

        assertEq(ERC20Token(tokenAddr).balanceOf(alice), amountOut);
    }

    function test_Buy_TransfersFeeToFeeCollector() public {
        address tokenAddr = _createToken();
        uint256 buyAmount = 0.1 ether;
        uint256 balBefore = feeCollector.balance;

        vm.prank(alice);
        pump.buy{value: buyAmount}(tokenAddr, 0);

        uint256 expectedFee = (buyAmount * PUMP_FEE) / 10000;
        assertEq(feeCollector.balance - balBefore, expectedFee);
    }

    function test_Buy_EmitsSwapEvent() public {
        address tokenAddr = _createToken();
        uint256 buyAmount = 0.1 ether;

        uint256 feeAmount = (buyAmount * PUMP_FEE) / 10000;
        uint256 amountInAfterFee = buyAmount - feeAmount;
        uint256 expectedOut = _computeBuyOutput(buyAmount, tokenAddr);

        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);
        uint256 expectedNativeAfter = nativeBefore + amountInAfterFee;
        uint256 expectedTokenAfter = tokenBefore - expectedOut;

        vm.expectEmit(true, true, true, true);
        emit Swap(alice, true, tokenAddr, amountInAfterFee, expectedOut, expectedNativeAfter, expectedTokenAfter);

        vm.prank(alice);
        pump.buy{value: buyAmount}(tokenAddr, 0);
    }

    function test_RevertBuy_InsufficientOutput() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        vm.expectRevert("insufficient output amount");
        pump.buy{value: 0.1 ether}(tokenAddr, type(uint256).max);
    }

    function test_RevertBuy_GraduatedToken() public {
        address tokenAddr = _createToken();
        _graduateToken(tokenAddr);

        vm.prank(alice);
        vm.expectRevert("token already graduated");
        pump.buy{value: 0.1 ether}(tokenAddr, 0);
    }

    function test_Buy_MultipleBuysUpdateProgressively() public {
        address tokenAddr = _createToken();
        uint256 buyAmount = 0.05 ether;

        vm.prank(alice);
        uint256 aliceOut = pump.buy{value: buyAmount}(tokenAddr, 0);

        vm.prank(bob);
        uint256 bobOut = pump.buy{value: buyAmount}(tokenAddr, 0);

        assertLt(bobOut, aliceOut);

        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);

        uint256 totalFeeAlice = (buyAmount * PUMP_FEE) / 10000;
        uint256 totalFeeBob = (buyAmount * PUMP_FEE) / 10000;
        assertEq(nativeReserve, INITIAL_NATIVE + (buyAmount - totalFeeAlice) + (buyAmount - totalFeeBob));
        assertEq(tokenReserve, INITIALTOKEN - aliceOut - bobOut);
    }

    function test_Sell_CalculatesCorrectOutput() public {
        address tokenAddr = _setupSell();

        uint256 sellAmount = 1000 ether;

        uint256 expected = _computeSellOutput(sellAmount, tokenAddr);

        vm.prank(alice);
        uint256 amountOut = pump.sell(tokenAddr, sellAmount, 0);

        assertEq(amountOut, expected);
    }

    function test_Sell_UpdatesReserves() public {
        address tokenAddr = _setupSell();

        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);

        uint256 sellAmount = 1000 ether;
        vm.prank(alice);
        uint256 amountOut = pump.sell(tokenAddr, sellAmount, 0);

        uint256 feeAmount = (sellAmount * PUMP_FEE) / 10000;
        uint256 amountInAfterFee = sellAmount - feeAmount;

        (uint256 nativeAfter, uint256 tokenAfter) = pump.pumpReserve(tokenAddr);

        assertEq(nativeAfter, nativeBefore - amountOut);
        assertEq(tokenAfter, tokenBefore + amountInAfterFee);
    }

    function test_Sell_TransfersNativeToSeller() public {
        address tokenAddr = _setupSell();

        uint256 sellAmount = 1000 ether;
        uint256 balBefore = alice.balance;

        vm.prank(alice);
        uint256 amountOut = pump.sell(tokenAddr, sellAmount, 0);

        assertEq(alice.balance - balBefore, amountOut);
    }

    function test_Sell_TransfersTokenFeeToFeeCollector() public {
        address tokenAddr = _setupSell();

        uint256 sellAmount = 1000 ether;
        uint256 feeCollectorBalBefore = ERC20Token(tokenAddr).balanceOf(feeCollector);

        vm.prank(alice);
        pump.sell(tokenAddr, sellAmount, 0);

        uint256 expectedFee = (sellAmount * PUMP_FEE) / 10000;
        assertEq(ERC20Token(tokenAddr).balanceOf(feeCollector) - feeCollectorBalBefore, expectedFee);
    }

    function test_Sell_EmitsSwapEvent() public {
        address tokenAddr = _setupSell();

        uint256 sellAmount = 1000 ether;
        uint256 feeAmount = (sellAmount * PUMP_FEE) / 10000;
        uint256 amountInAfterFee = sellAmount - feeAmount;

        uint256 expectedOut = _computeSellOutput(sellAmount, tokenAddr);

        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);
        uint256 expectedTokenAfter = tokenBefore + amountInAfterFee;
        uint256 expectedNativeAfter = nativeBefore - expectedOut;

        vm.expectEmit(true, true, true, true);
        emit Swap(alice, false, tokenAddr, amountInAfterFee, expectedOut, expectedTokenAfter, expectedNativeAfter);

        vm.prank(alice);
        pump.sell(tokenAddr, sellAmount, 0);
    }

    function test_RevertSell_InsufficientOutput() public {
        address tokenAddr = _setupSell();

        vm.prank(alice);
        vm.expectRevert("insufficient output amount");
        pump.sell(tokenAddr, 1000 ether, type(uint256).max);
    }

    function test_RevertSell_GraduatedToken() public {
        address tokenAddr = _createToken();
        _graduateToken(tokenAddr);

        vm.prank(alice);
        vm.expectRevert("token already graduated");
        pump.sell(tokenAddr, 1, 0);
    }

    function test_RevertGraduate_AlreadyGraduated() public {
        address tokenAddr = _createToken();
        _graduateToken(tokenAddr);

        vm.expectRevert("token already graduated");
        pump.graduate(tokenAddr);
    }

    function test_RevertGraduate_NotReachedCap() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        pump.buy{value: 0.01 ether}(tokenAddr, 0);

        vm.expectRevert("not reach graduation cap");
        pump.graduate(tokenAddr);
    }

    function test_Graduate_CreatesNewPool() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        address poolAddr = factory.getPool(
            tokenAddr < wrappedNative ? tokenAddr : wrappedNative,
            tokenAddr < wrappedNative ? wrappedNative : tokenAddr,
            10000
        );
        assertEq(poolAddr, address(0));

        pump.graduate(tokenAddr);

        poolAddr = factory.getPool(
            tokenAddr < wrappedNative ? tokenAddr : wrappedNative,
            tokenAddr < wrappedNative ? wrappedNative : tokenAddr,
            10000
        );
        assertTrue(poolAddr != address(0));
        assertTrue(pool.initialized());
    }

    function test_Graduate_InitializesPoolWithCorrectSqrtPriceX96() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        assertTrue(tokenAddr < wrappedNative);

        pump.graduate(tokenAddr);

        uint160 sqrtP = pool.storedSqrtPriceX96();
        assertGt(sqrtP, 0);
        assertLt(sqrtP, 2 ** 96);
        assertGe(sqrtP, MIN_SQRT_RATIO);
        assertLt(sqrtP, MAX_SQRT_RATIO);
    }

    function test_Graduate_HandlesExistingPool_NonZeroSlot0() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        pool.setSlot0(uint160(1));

        (address tkn0, address tkn1) =
            tokenAddr < wrappedNative ? (tokenAddr, wrappedNative) : (wrappedNative, tokenAddr);
        factory.createPool(tkn0, tkn1, 10000);

        MockV3Pool freshPool = new MockV3Pool();
        freshPool.setSlot0(uint160(1));
        factory.setMockPool(address(freshPool));

        factory.createPool(tkn0, tkn1, 10000);

        pump.graduate(tokenAddr);

        assertFalse(freshPool.initialized());
        assertEq(posManager.mintCallCount(), 1);
    }

    function test_Graduate_HandlesExistingPool_ZeroSlot0() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        (address tkn0, address tkn1) =
            tokenAddr < wrappedNative ? (tokenAddr, wrappedNative) : (wrappedNative, tokenAddr);
        factory.createPool(tkn0, tkn1, 10000);

        pump.graduate(tokenAddr);

        assertTrue(pool.initialized());
    }

    function test_Graduate_MintsLPWithCorrectParams() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        uint256 nativeReserve;
        uint256 tokenLiquidity;
        {
            uint256 tokenReserve;
            (nativeReserve, tokenReserve) = pump.pumpReserve(tokenAddr);
            tokenLiquidity = Math.mulDiv(tokenReserve, nativeReserve, VIRTUAL_AMOUNT + nativeReserve);
        }

        pump.graduate(tokenAddr);

        (
            address _token0,
            address _token1,
            uint24 _fee,
            int24 _tickLower,
            int24 _tickUpper,
            uint256 _amount0Desired,
            uint256 _amount1Desired,
            uint256 _amount0Min,
            uint256 _amount1Min,
            address _recipient,
            uint256 _deadline
        ) = posManager.lastMintParams();

        if (tokenAddr < wrappedNative) {
            assertEq(_token0, tokenAddr);
            assertEq(_token1, wrappedNative);
            assertEq(_amount0Desired, tokenLiquidity);
            assertEq(_amount1Desired, nativeReserve);
        } else {
            assertEq(_token0, wrappedNative);
            assertEq(_token1, tokenAddr);
            assertEq(_amount0Desired, nativeReserve);
            assertEq(_amount1Desired, tokenLiquidity);
        }

        assertEq(_fee, 10000);
        assertEq(_tickLower, -887200);
        assertEq(_tickUpper, 887200);
        assertEq(_amount0Min, (_amount0Desired * 95) / 100);
        assertEq(_amount1Min, (_amount1Desired * 95) / 100);
        assertEq(_recipient, address(0xdead));
        assertEq(_deadline, block.timestamp + 1 hours);
    }

    function test_Graduate_DeletesReservesAndSetsFlag() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        pump.graduate(tokenAddr);

        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, 0);
        assertEq(tokenReserve, 0);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_Graduate_SweepsLeftoverToFeeCollector() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);

        uint256 usedNative = nativeReserve / 2;
        uint256 usedToken = tokenReserve / 2;
        posManager.setPartialFill(usedNative, usedToken);

        uint256 feeNativeBefore = feeCollector.balance;
        uint256 feeTokenBefore = ERC20Token(tokenAddr).balanceOf(feeCollector);

        pump.graduate(tokenAddr);

        assertEq(feeCollector.balance - feeNativeBefore, nativeReserve - usedNative);
        assertEq(ERC20Token(tokenAddr).balanceOf(feeCollector) - feeTokenBefore, tokenReserve - usedToken);
        assertEq(address(posManager).balance, usedNative);
        assertEq(ERC20Token(tokenAddr).balanceOf(address(pump)), 0);
    }

    function test_Graduate_SeedsV3AtCurvePrice_N1() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);
        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);

        uint256 feeTokenBefore = ERC20Token(tokenAddr).balanceOf(feeCollector);
        pump.graduate(tokenAddr);

        assertTrue(tokenAddr < wrappedNative);
        (,,,,, uint256 amount0Desired, uint256 amount1Desired,,,,) = posManager.lastMintParams();
        uint256 tokenDeposited = amount0Desired;
        uint256 nativeDeposited = amount1Desired;

        assertEq(nativeDeposited, nativeReserve);
        assertLt(tokenDeposited, tokenReserve);

        uint256 depositPrice = (nativeDeposited * 1e18) / tokenDeposited;
        uint256 curvePrice = ((VIRTUAL_AMOUNT + nativeReserve) * 1e18) / tokenReserve;
        uint256 rawPrice = (nativeReserve * 1e18) / tokenReserve;
        assertApproxEqRel(depositPrice, curvePrice, 1e12);
        assertGt(depositPrice, rawPrice);

        assertEq(ERC20Token(tokenAddr).balanceOf(feeCollector) - feeTokenBefore, tokenReserve - tokenDeposited);
    }

    function test_GetAmountOut_CorrectCalculation() public {
        assertEq(pump.getAmountOut(1000, 10000, 20000), 1801);
    }

    function test_RevertGetAmountOut_ZeroReserves() public {
        vm.expectRevert("invalid reserves");
        pump.getAmountOut(1000, 0, 1000);

        vm.expectRevert("invalid reserves");
        pump.getAmountOut(1000, 1000, 0);
    }

    function test_BuyThenSell_RoundTrip() public {
        address tokenAddr = _createToken();
        uint256 buyAmount = 0.1 ether;

        vm.prank(alice);
        uint256 tokensReceived = pump.buy{value: buyAmount}(tokenAddr, 0);

        vm.prank(alice);
        ERC20Token(tokenAddr).approve(address(pump), tokensReceived);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        uint256 nativeReceived = pump.sell(tokenAddr, tokensReceived, 0);

        assertEq(alice.balance - aliceBalBefore, nativeReceived);
        assertLt(nativeReceived, buyAmount);

        assertEq(nativeReceived, 96496795268583896);
    }

    function test_GraduationBoundary_ExactCap_AtThreshold() public {
        address tokenAddr = _createToken();
        _setReserves(tokenAddr, GRADUATION_AMOUNT, INITIALTOKEN);

        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_GraduationBoundary_OneWeiShort() public {
        address tokenAddr = _createToken();
        _setReserves(tokenAddr, GRADUATION_AMOUNT - 1, INITIALTOKEN);

        vm.expectRevert("not reach graduation cap");
        pump.graduate(tokenAddr);
    }

    function test_GetAmountOut_IndependentVectors() public {
        assertEq(pump.getAmountOut(100, 1000, 1000), 90);
        assertEq(pump.getAmountOut(1 ether, 3400 ether, 1e27), 291091711531054193043790);
        assertEq(pump.getAmountOut(0.5 ether, 0.55 ether, 1e27), 473684210526315789473684210);
    }

    function test_Buy_ExactOutput_IndependentVector() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        uint256 out = pump.buy{value: 0.1 ether}(tokenAddr, 0);
        assertEq(out, 151247665931081310473603802);
    }

    function test_CreateToken_EmitsCreation() public {
        vm.recordLogs();
        vm.prank(alice);
        address tokenAddr = pump.createToken{value: CREATE_FEE + INITIAL_NATIVE}(
            "TestToken", "TT", "logo", "desc", "link1", "link2", "link3"
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 sig = keccak256("Creation(address,address,string,string,string,string,string,uint256)");
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] != sig) continue;
            found = true;
            assertEq(address(uint160(uint256(logs[i].topics[1]))), alice);
            (
                address evToken,
                string memory logo,
                string memory desc,
                string memory l1,
                string memory l2,
                string memory l3,
                uint256 ts
            ) = abi.decode(logs[i].data, (address, string, string, string, string, string, uint256));
            assertEq(evToken, tokenAddr);
            assertEq(logo, "logo");
            assertEq(desc, "desc");
            assertEq(l1, "link1");
            assertEq(l2, "link2");
            assertEq(l3, "link3");
            assertEq(ts, block.timestamp);
        }
        assertTrue(found, "Creation event not emitted");
    }

    function test_Graduate_EmitsGraduation() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);
        vm.expectEmit(true, true, true, true);
        emit Graduation(address(this), tokenAddr);
        pump.graduate(tokenAddr);
    }

    function test_TwoTokens_ReservesIsolated() public {
        address tokenA = _createTokenAs(alice);
        address tokenB = _createTokenAs(bob);

        _buyToGraduation(tokenA);
        pump.graduate(tokenA);

        assertTrue(pump.isGraduate(tokenA));
        assertFalse(pump.isGraduate(tokenB));
        (uint256 natB, uint256 tokB) = pump.pumpReserve(tokenB);
        assertEq(natB, INITIAL_NATIVE);
        assertEq(tokB, INITIALTOKEN);
    }

    function test_GraduationAmountZero_AllowsImmediateGraduation() public {
        pump.setCurveState(INITIAL_NATIVE, VIRTUAL_AMOUNT, 0);
        address tokenAddr = _createToken();
        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_SetFeeCollectorZero_BurnsCreationFee() public {
        pump.setFeeCollector(address(0));
        uint256 burnedBefore = address(0).balance;
        _createTokenAs(alice);
        assertEq(address(0).balance - burnedBefore, CREATE_FEE);
    }

    function test_PumpFeeTooHigh_RevertsBuy() public {
        address tokenAddr = _createToken();
        pump.setFee(CREATE_FEE, 10001);
        vm.prank(alice);
        vm.expectRevert(stdError.arithmeticError);
        pump.buy{value: 0.1 ether}(tokenAddr, 0);
    }

    function testFuzz_GetAmountOut_LtOutputReserve(uint256 inputAmount, uint256 inReserve, uint256 outReserve) public {
        inReserve = bound(inReserve, 1, 1e30);
        outReserve = bound(outReserve, 1, 1e30);
        inputAmount = bound(inputAmount, 0, 1e30);
        assertLt(pump.getAmountOut(inputAmount, inReserve, outReserve), outReserve);
    }

    function testFuzz_BuyThenSell_NeverProfitable(uint256 buyAmount) public {
        address tokenAddr = _createToken();
        buyAmount = bound(buyAmount, 1e9, 10 ether);
        vm.deal(alice, buyAmount + 1 ether);

        vm.prank(alice);
        uint256 tokensOut = pump.buy{value: buyAmount}(tokenAddr, 0);

        vm.prank(alice);
        ERC20Token(tokenAddr).approve(address(pump), tokensOut);
        vm.prank(alice);
        uint256 nativeBack = pump.sell(tokenAddr, tokensOut, 0);

        assertLe(nativeBack, buyAmount);
    }

    function testFuzz_Buy_PriceMonotonic(uint256 amount) public {
        address tokenAddr = _createToken();
        amount = bound(amount, 1e12, 1 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        vm.prank(alice);
        uint256 firstOut = pump.buy{value: amount}(tokenAddr, 0);
        vm.prank(bob);
        uint256 secondOut = pump.buy{value: amount}(tokenAddr, 0);

        assertLe(secondOut, firstOut);
    }

    function _setupSell() internal returns (address) {
        address tokenAddr = _createToken();

        vm.prank(alice);
        uint256 bought = pump.buy{value: 0.1 ether}(tokenAddr, 0);

        vm.prank(alice);
        ERC20Token(tokenAddr).approve(address(pump), bought);

        return tokenAddr;
    }

    function _buyToGraduation(address tokenAddr) internal {
        uint256 buyStep = 0.01 ether;
        while (true) {
            (uint256 nativeRes, uint256 tokenRes) = pump.pumpReserve(tokenAddr);
            if (nativeRes > 0 && tokenRes * GRADUATION_AMOUNT <= nativeRes * INITIALTOKEN) {
                break;
            }
            vm.prank(alice);
            pump.buy{value: buyStep}(tokenAddr, 0);
        }
    }

    function _graduateToken(address tokenAddr) internal {
        _buyToGraduation(tokenAddr);
        pump.graduate(tokenAddr);
    }

    function _setReserves(address tokenAddr, uint256 native, uint256 token) internal {
        bytes32 base = keccak256(abi.encode(tokenAddr, uint256(0)));
        vm.store(address(pump), base, bytes32(native));
        vm.store(address(pump), bytes32(uint256(base) + 1), bytes32(token));
        vm.deal(address(pump), address(pump).balance + native);
    }
}

contract BondingCurveJunoswapLowWrappedTest is Test {
    event Graduation(address indexed sender, address tokenAddr);

    BondingCurveJunoswap public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;

    address public alice;
    address public wrappedNative = address(1);

    uint256 constant CREATE_FEE = 0.001 ether;
    uint256 constant INITIAL_NATIVE = 0.05 ether;
    uint256 constant VIRTUAL_AMOUNT = 0.5 ether;
    uint256 constant GRADUATION_AMOUNT = 0.2 ether;
    uint256 constant PUMP_FEE = 100;
    uint256 constant INITIALTOKEN = 1_000_000_000 ether;

    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    receive() external payable {}

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();

        alice = makeAddr("alice");
        factory.setMockPool(address(pool));
        posManager.setWrappedNative(wrappedNative);
        pump = new BondingCurveJunoswap(wrappedNative, address(factory), address(posManager));
        pump.setCurveState(INITIAL_NATIVE, VIRTUAL_AMOUNT, GRADUATION_AMOUNT);
        pump.setFee(CREATE_FEE, PUMP_FEE);

        vm.deal(alice, 100 ether);
    }

    function _createToken() internal returns (address) {
        vm.prank(alice);
        return pump.createToken{value: CREATE_FEE + INITIAL_NATIVE}("TestToken", "TT", "logo", "desc", "l1", "l2", "l3");
    }

    function _buyToGraduation(address tokenAddr) internal {
        uint256 buyStep = 0.01 ether;
        while (true) {
            (uint256 nativeRes, uint256 tokenRes) = pump.pumpReserve(tokenAddr);
            if (nativeRes > 0 && tokenRes * GRADUATION_AMOUNT <= nativeRes * INITIALTOKEN) {
                break;
            }
            vm.prank(alice);
            pump.buy{value: buyStep}(tokenAddr, 0);
        }
    }

    function test_Graduate_SucceedsWithProductionOrdering() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_Graduate_SqrtPriceX96Correct_ProductionOrdering() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        assertGt(uint160(tokenAddr), uint160(wrappedNative));

        pump.graduate(tokenAddr);

        uint160 sqrtP = pool.storedSqrtPriceX96();
        assertGt(sqrtP, 2 ** 96);
        assertLt(sqrtP, MAX_SQRT_RATIO);
        assertGe(sqrtP, MIN_SQRT_RATIO);
    }

    function test_Graduate_MintParamsCorrect_ProductionOrdering() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        uint256 nativeReserve;
        uint256 tokenLiquidity;
        {
            uint256 tokenReserve;
            (nativeReserve, tokenReserve) = pump.pumpReserve(tokenAddr);
            tokenLiquidity = Math.mulDiv(tokenReserve, nativeReserve, VIRTUAL_AMOUNT + nativeReserve);
        }

        pump.graduate(tokenAddr);

        (
            address _token0,
            address _token1,
            uint24 _fee,
            int24 _tickLower,
            int24 _tickUpper,
            uint256 _amount0Desired,
            uint256 _amount1Desired,
            uint256 _amount0Min,
            uint256 _amount1Min,
            address _recipient,
            uint256 _deadline
        ) = posManager.lastMintParams();

        assertEq(_token0, wrappedNative);
        assertEq(_token1, tokenAddr);
        assertEq(_amount0Desired, nativeReserve);
        assertEq(_amount1Desired, tokenLiquidity);

        assertEq(_fee, 10000);
        assertEq(_tickLower, -887200);
        assertEq(_tickUpper, 887200);
        assertEq(_recipient, address(0xdead));
        assertEq(_deadline, block.timestamp + 1 hours);

        _checkSlippage(_amount0Desired, _amount0Min, _amount1Desired, _amount1Min);
    }

    function _checkSlippage(uint256 amount0Desired, uint256 amount0Min, uint256 amount1Desired, uint256 amount1Min)
        internal
        pure
    {
        assertEq(amount0Min, (amount0Desired * 95) / 100);
        assertEq(amount1Min, (amount1Desired * 95) / 100);
    }

    function test_Graduate_ExistingPoolZeroSlot0_ProductionOrdering() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        factory.createPool(wrappedNative, tokenAddr, 10000);

        pump.graduate(tokenAddr);
        assertTrue(pool.initialized());
    }
}

contract BondingCurveProductionConfigTest is Test {
    BondingCurveJunoswap public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;

    address public alice;
    address public wrappedNative = address(1);

    uint256 constant CREATE_FEE = 0.1 ether;
    uint256 constant INITIAL_NATIVE = 0;
    uint256 constant VIRTUAL_AMOUNT = 3400 ether;
    uint256 constant GRADUATION_AMOUNT = 4000 ether;
    uint256 constant PUMP_FEE = 100;
    uint256 constant INITIALTOKEN = 1_000_000_000 ether;

    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    receive() external payable {}

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();
        factory.setMockPool(address(pool));
        posManager.setWrappedNative(wrappedNative);

        pump = new BondingCurveJunoswap(wrappedNative, address(factory), address(posManager));
        pump.setCurveState(INITIAL_NATIVE, VIRTUAL_AMOUNT, GRADUATION_AMOUNT);
        pump.setFee(CREATE_FEE, PUMP_FEE);

        alice = makeAddr("alice");
        vm.deal(alice, 100 ether);
    }

    function _createToken() internal returns (address) {
        vm.prank(alice);
        return pump.createToken{value: CREATE_FEE + INITIAL_NATIVE}("TestToken", "TT", "logo", "desc", "l1", "l2", "l3");
    }

    function test_Create_FirstBuyWorks_ZeroInitialNative() public {
        address tokenAddr = _createToken();
        (uint256 nat0, uint256 tok0) = pump.pumpReserve(tokenAddr);
        assertEq(nat0, 0);
        assertEq(tok0, INITIALTOKEN);

        vm.prank(alice);
        uint256 out = pump.buy{value: 1 ether}(tokenAddr, 0);
        assertGt(out, 0);

        uint256 fee = (1 ether * PUMP_FEE) / 10000;
        (uint256 nat1, uint256 tok1) = pump.pumpReserve(tokenAddr);
        assertEq(nat1, 1 ether - fee);
        assertEq(tok1, INITIALTOKEN - out);
    }

    function test_Graduate_ProductionMagnitude_EncoderInRange() public {
        address tokenAddr = _createToken();
        _setReserves(tokenAddr, GRADUATION_AMOUNT, INITIALTOKEN);

        pump.graduate(tokenAddr);

        uint160 sqrtP = pool.storedSqrtPriceX96();
        assertGe(sqrtP, MIN_SQRT_RATIO);
        assertLt(sqrtP, MAX_SQRT_RATIO);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function _setReserves(address tokenAddr, uint256 native, uint256 token) internal {
        bytes32 base = keccak256(abi.encode(tokenAddr, uint256(0)));
        vm.store(address(pump), base, bytes32(native));
        vm.store(address(pump), bytes32(uint256(base) + 1), bytes32(token));
        vm.deal(address(pump), address(pump).balance + native);
    }
}

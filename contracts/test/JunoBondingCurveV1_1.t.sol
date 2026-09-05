// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/ERC20Token.sol";
import "./mocks/MockV3Factory.sol";
import "./mocks/MockV3Pool.sol";
import "./mocks/MockPositionManager.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract JunoBondingCurveV1_1Test is Test {
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

    JunoBondingCurveV1_1 public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;

    address public feeCollector;
    address public alice;
    address public bob;
    address public wrappedNative;

    uint256 constant CREATE_FEE = 0.001 ether;
    uint256 constant VIRTUAL_AMOUNT = 0.34 ether;
    uint256 constant GRADUATION_AMOUNT = 0.4 ether;
    uint256 constant CURVE_RESERVE = 1267592592592592592592592592;
    uint256 constant PUMP_FEE = 100;

    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    receive() external payable {}
    fallback() external payable {}

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
        posManager.setPoolFactory(address(factory));
        pump = new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), feeCollector, VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );
        pump.setFee(CREATE_FEE, PUMP_FEE);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _createToken() internal returns (address) {
        return _createTokenAs(alice);
    }

    function _createTokenAs(address user) internal returns (address) {
        vm.prank(user);
        return pump.createToken{value: CREATE_FEE}(
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

    function test_RevertSetFee_NonFeeCollector() public {
        vm.prank(alice);
        vm.expectRevert();
        pump.setFee(0, 0);
    }

    function test_CreateToken_SetsReserves() public {
        assertEq(pump.curveReserve(), CURVE_RESERVE);
        address tokenAddr = _createToken();
        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, 0);
        assertEq(tokenReserve, CURVE_RESERVE);
    }

    function test_InitialNative_StaysExposedAndMatchesSeededReserve() public {
        assertEq(pump.initialNative(), 0);
        uint256 balanceBefore = alice.balance;
        address tokenAddr = _createToken();
        (uint256 nativeReserve, ) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, pump.initialNative());
        assertEq(balanceBefore - alice.balance, pump.createFee() + pump.initialNative());
    }

    function test_CreateToken_RecordsCreator() public {
        address tokenAddr = _createTokenAs(bob);
        assertEq(pump.creatorOf(tokenAddr), bob);
        assertEq(pump.creatorOf(address(0xBEEF)), address(0), "unknown token has no creator");
    }

    function test_CreateToken_TransfersFeeToCollector() public {
        uint256 balBefore = feeCollector.balance;
        _createToken();
        assertEq(feeCollector.balance - balBefore, CREATE_FEE);
    }

    function test_RevertCreateToken_WrongValue() public {
        vm.prank(alice);
        vm.expectRevert("insufficient creation cost");
        pump.createToken{value: CREATE_FEE - 1}("T", "T", "", "", "", "", "");

        vm.prank(alice);
        vm.expectRevert("insufficient creation cost");
        pump.createToken{value: CREATE_FEE + 1}("T", "T", "", "", "", "", "");
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
        assertEq(nativeReserve, (buyAmount - totalFeeAlice) + (buyAmount - totalFeeBob));
        assertEq(tokenReserve, CURVE_RESERVE - aliceOut - bobOut);
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
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, 10000);

        (address tkn0, address tkn1) =
            tokenAddr < wrappedNative ? (tokenAddr, wrappedNative) : (wrappedNative, tokenAddr);
        MockV3Pool existing = MockV3Pool(factory.getPool(tkn0, tkn1, 10000));
        uint256 mintsBefore = posManager.mintCallCount();

        pump.graduate(tokenAddr);

        assertFalse(existing.initialized(), "initialize must be skipped when slot0 is already set");
        assertEq(posManager.mintCallCount(), mintsBefore + 1);
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
        assertEq(_amount0Min, (_amount0Desired * 99) / 100);
        assertEq(_amount1Min, (_amount1Desired * 99) / 100);
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

    function test_Graduate_BurnsLeftoverAndRefundsNative() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        (uint256 nativeReserve,) = pump.pumpReserve(tokenAddr);
        uint256 pumpTokenBalance = ERC20Token(tokenAddr).balanceOf(address(pump));

        uint256 usedNative = nativeReserve / 2;
        uint256 usedToken = pumpTokenBalance / 2;
        posManager.setPartialFill(usedNative, usedToken);

        uint256 feeNativeBefore = feeCollector.balance;
        uint256 burnedBefore = ERC20Token(tokenAddr).balanceOf(address(0xdead));

        pump.graduate(tokenAddr);

        assertEq(feeCollector.balance - feeNativeBefore, nativeReserve - usedNative);
        assertEq(ERC20Token(tokenAddr).balanceOf(address(0xdead)) - burnedBefore, pumpTokenBalance - usedToken);
        assertEq(address(posManager).balance, usedNative);
        assertEq(ERC20Token(tokenAddr).balanceOf(address(pump)), 0);
    }

    function test_Graduate_SeedsV3AtCurvePrice_N1() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);
        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);

        uint256 pumpTokenBalance = ERC20Token(tokenAddr).balanceOf(address(pump));
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

        uint256 tokenUsed = posManager.lastAmount0();
        assertLe(tokenUsed, tokenDeposited);
        assertEq(ERC20Token(tokenAddr).balanceOf(address(0xdead)), pumpTokenBalance - tokenUsed);
        assertLt(pumpTokenBalance - tokenUsed, 1 ether);
    }

    function test_GetAmountOut_CorrectCalculation() public {
        assertEq(pump.getAmountOut(1000, 10000, 20000), 1818);
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

        assertEq(nativeReceived, 98231524394420218);
    }

    function test_GraduationBoundary_ExactCap_AtThreshold() public {
        address tokenAddr = _createToken();
        _setReserves(tokenAddr, GRADUATION_AMOUNT, CURVE_RESERVE);

        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_GraduationBoundary_OneWeiShort() public {
        address tokenAddr = _createToken();
        _setReserves(tokenAddr, GRADUATION_AMOUNT - 1, CURVE_RESERVE);

        vm.expectRevert("not reach graduation cap");
        pump.graduate(tokenAddr);
    }

    function test_GetAmountOut_IndependentVectors() public {
        assertEq(pump.getAmountOut(1 ether, 1 ether, 1 ether), 0.5 ether);
        assertEq(pump.getAmountOut(1 ether, 3400 ether, 1e27), 294031167303734195824757);
        assertEq(pump.getAmountOut(0.5 ether, 0.55 ether, 1e27), 476190476190476190476190476);
    }

    function test_Buy_ExactOutput_IndependentVector() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        uint256 out = pump.buy{value: 0.1 ether}(tokenAddr, 0);
        assertEq(out, 285858010630220197418375094);
    }

    function test_CreateToken_EmitsCreation() public {
        vm.recordLogs();
        vm.prank(alice);
        address tokenAddr = pump.createToken{value: CREATE_FEE}(
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
        assertEq(natB, 0);
        assertEq(tokB, CURVE_RESERVE);
    }

    function test_ConstructorRejectsInvalidParams() public {
        vm.expectRevert("invalid fee collector");
        new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), address(0), VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );

        vm.expectRevert("invalid curve state");
        new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), feeCollector, VIRTUAL_AMOUNT, 0
        );

        vm.expectRevert("invalid curve state");
        new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), feeCollector, 0, GRADUATION_AMOUNT
        );
    }

    function test_SetFeeRejectsAboveCap() public {
        vm.expectRevert("fee too high");
        pump.setFee(CREATE_FEE, 501);

        vm.expectRevert("create fee too high");
        pump.setFee(10 ether + 1, PUMP_FEE);

        pump.setFee(10 ether, 500);
        assertEq(pump.createFee(), 10 ether, "cap itself is allowed");
        assertEq(pump.pumpFee(), 500);
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

    function testFuzz_Buy_ConservesNative(uint256 prologue, uint256 amount) public {
        address tokenAddr = _createToken();
        prologue = bound(prologue, 1e12, 0.35 ether);
        amount = bound(amount, 1e12, 5 ether);

        vm.prank(alice);
        pump.buy{value: prologue}(tokenAddr, 0);

        uint256 payerBefore = bob.balance;
        uint256 curveBefore = address(pump).balance;
        uint256 collectorBefore = feeCollector.balance;
        (uint256 reserveBefore,) = pump.pumpReserve(tokenAddr);

        vm.prank(bob);
        pump.buy{value: amount}(tokenAddr, 0);

        (uint256 reserveAfter,) = pump.pumpReserve(tokenAddr);
        uint256 paid = payerBefore - bob.balance;
        uint256 curveDelta = address(pump).balance - curveBefore;

        assertEq(paid, curveDelta + (feeCollector.balance - collectorBefore));
        assertEq(reserveAfter - reserveBefore, curveDelta);
        assertLe(reserveAfter, GRADUATION_AMOUNT);
    }

    function testFuzz_ClampedBuy_LeavesTokenGraduatable(uint256 prologue) public {
        address tokenAddr = _createToken();
        prologue = bound(prologue, 1e12, 0.35 ether);

        vm.prank(alice);
        pump.buy{value: prologue}(tokenAddr, 0);
        vm.prank(bob);
        pump.buy{value: 10 ether}(tokenAddr, 0);

        (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, GRADUATION_AMOUNT);

        uint256 tokenLiquidity =
            Math.mulDiv(tokenReserve, nativeReserve, VIRTUAL_AMOUNT + nativeReserve);
        uint256 held = ERC20Token(tokenAddr).balanceOf(address(pump));
        assertLe(tokenLiquidity, held, "LP position underfunded: graduate() would clamp");
        assertLt(held - tokenLiquidity, 1 ether, "unsold remainder is not dust");

        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_Buy_CapsAtGraduationTargetAndRefundsExcess() public {
        address tokenAddr = _createToken();
        uint256 balanceBefore = alice.balance;

        vm.prank(alice);
        pump.buy{value: 10 ether}(tokenAddr, 0);

        (uint256 nativeReserve,) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, GRADUATION_AMOUNT);

        uint256 room = GRADUATION_AMOUNT;
        assertEq(balanceBefore - alice.balance, (room * 10000) / (10000 - PUMP_FEE));
    }

    function test_RevertBuy_CurveComplete() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        pump.buy{value: 10 ether}(tokenAddr, 0);

        vm.prank(bob);
        vm.expectRevert("curve complete");
        pump.buy{value: 1 ether}(tokenAddr, 0);
    }

    function test_Graduate_AfterOversizedBuy_LeavesDustOnly() public {
        address tokenAddr = _createToken();
        vm.deal(alice, 1000 ether);
        vm.prank(alice);
        pump.buy{value: 1000 ether}(tokenAddr, 0);

        pump.graduate(tokenAddr);

        assertTrue(pump.isGraduate(tokenAddr));
        assertEq(ERC20Token(tokenAddr).balanceOf(address(pump)), 0);
        assertLt(ERC20Token(tokenAddr).balanceOf(address(0xdead)), 1 ether);
    }

    function test_SellAfterCap_ReopensBuyingAndRelandsOnTarget() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        uint256 bought = pump.buy{value: 10 ether}(tokenAddr, 0);

        vm.startPrank(alice);
        ERC20Token(tokenAddr).approve(address(pump), bought);
        pump.sell(tokenAddr, bought / 10, 0);
        vm.stopPrank();

        (uint256 nativeReserve,) = pump.pumpReserve(tokenAddr);
        assertLt(nativeReserve, GRADUATION_AMOUNT);

        vm.prank(bob);
        pump.buy{value: 10 ether}(tokenAddr, 0);
        (nativeReserve,) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, GRADUATION_AMOUNT);
    }

    function test_Sell_PaysContractSellerWithExpensiveReceive() public {
        address tokenAddr = _createToken();
        GasHungryReceiver seller = new GasHungryReceiver();
        vm.deal(address(seller), 1 ether);

        uint256 bought = seller.buyOn(pump, tokenAddr, 0.05 ether);
        uint256 balanceBefore = address(seller).balance;

        uint256 received = seller.sellOn(pump, tokenAddr, bought);

        assertGt(received, 0);
        assertEq(address(seller).balance - balanceBefore, received);
    }

    function test_Buy_RefundsOverCapToContractBuyer() public {
        address tokenAddr = _createToken();
        GasHungryReceiver buyer = new GasHungryReceiver();
        vm.deal(address(buyer), 10 ether);

        buyer.buyOn(pump, tokenAddr, 10 ether);

        (uint256 nativeReserve,) = pump.pumpReserve(tokenAddr);
        assertEq(nativeReserve, GRADUATION_AMOUNT);
        assertEq(address(buyer).balance, 10 ether - (GRADUATION_AMOUNT * 10000) / (10000 - PUMP_FEE));
    }

    function test_Sell_RevertsWhenPayeeRejects() public {
        address tokenAddr = _createToken();
        RejectingReceiver seller = new RejectingReceiver();
        vm.deal(address(seller), 1 ether);

        uint256 bought = seller.buyOn(pump, tokenAddr, 0.05 ether);
        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);

        vm.expectRevert("native transfer failed");
        seller.sellOn(pump, tokenAddr, bought);

        (uint256 nativeAfter, uint256 tokenAfter) = pump.pumpReserve(tokenAddr);
        assertEq(nativeAfter, nativeBefore);
        assertEq(tokenAfter, tokenBefore);
    }

    function test_FeeCollectorContract_DoesNotBrickCurve() public {
        GasHungryReceiver collector = new GasHungryReceiver();
        pump = new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), address(collector), VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );
        vm.prank(address(collector));
        pump.setFee(CREATE_FEE, PUMP_FEE);

        address tokenAddr = _createTokenAs(alice);
        assertEq(address(collector).balance, CREATE_FEE);

        _buyToGraduation(tokenAddr);
        assertGt(address(collector).balance, CREATE_FEE);

        (uint256 nativeReserve,) = pump.pumpReserve(tokenAddr);
        uint256 usedNative = nativeReserve / 2;
        posManager.setPartialFill(usedNative, ERC20Token(tokenAddr).balanceOf(address(pump)) / 2);

        uint256 collectorBefore = address(collector).balance;
        pump.graduate(tokenAddr);

        assertTrue(pump.isGraduate(tokenAddr));
        assertEq(address(collector).balance - collectorBefore, nativeReserve - usedNative);
    }

    function test_ReentrantBuyerDuringRefund_CannotOvershootCap() public {
        address tokenAddr = _createToken();
        ReentrantBuyer buyer = new ReentrantBuyer(pump, tokenAddr);
        vm.deal(address(buyer), 10 ether);

        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);
        uint256 kBefore = (VIRTUAL_AMOUNT + nativeBefore) * tokenBefore;

        buyer.buyOverCap(1 ether, 0.05 ether);

        (uint256 nativeAfter, uint256 tokenAfter) = pump.pumpReserve(tokenAddr);
        assertTrue(buyer.entered());
        assertLe(nativeAfter, GRADUATION_AMOUNT);
        assertGe((VIRTUAL_AMOUNT + nativeAfter) * tokenAfter, kBefore);
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
            (uint256 nativeRes,) = pump.pumpReserve(tokenAddr);
            if (nativeRes >= GRADUATION_AMOUNT) {
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

    function test_ZeroValueBuy_SucceedsAndEmitsSwap() public {
        address tokenAddr = _createToken();
        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);

        vm.expectEmit(true, true, true, true);
        emit Swap(alice, true, tokenAddr, 0, 0, nativeBefore, tokenBefore);
        vm.prank(alice);
        uint256 out = pump.buy{value: 0}(tokenAddr, 0);

        assertEq(out, 0);
        (uint256 nativeAfter, uint256 tokenAfter) = pump.pumpReserve(tokenAddr);
        assertEq(nativeAfter, nativeBefore, "a zero buy must not move reserves");
        assertEq(tokenAfter, tokenBefore);
    }

    function test_ZeroAmountSell_SucceedsAndEmitsSwap() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        pump.buy{value: 0.01 ether}(tokenAddr, 0);
        (uint256 nativeBefore, uint256 tokenBefore) = pump.pumpReserve(tokenAddr);

        vm.startPrank(alice);
        ERC20Token(tokenAddr).approve(address(pump), type(uint256).max);
        vm.expectEmit(true, true, true, true);
        emit Swap(alice, false, tokenAddr, 0, 0, tokenBefore, nativeBefore);
        uint256 out = pump.sell(tokenAddr, 0, 0);
        vm.stopPrank();

        assertEq(out, 0);
        (uint256 nativeAfter, uint256 tokenAfter) = pump.pumpReserve(tokenAddr);
        assertEq(nativeAfter, nativeBefore, "a zero sell must not move reserves");
        assertEq(tokenAfter, tokenBefore);
    }

    function test_Receive_RejectsEveryoneButPositionManager() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok, bytes memory ret) = address(pump).call{value: 1 ether}("");
        assertFalse(ok, "the curve must not accept stray native");
        assertEq(ret, abi.encodeWithSignature("Error(string)", "only posManager"));

        vm.deal(address(posManager), 1 ether);
        vm.prank(address(posManager));
        (ok,) = address(pump).call{value: 1 ether}("");
        assertTrue(ok, "refundETH from the position manager must be accepted");
        assertEq(address(pump).balance, 1 ether);
    }

    function test_ReentrantSeller_CannotBreakReserves() public {
        address tokenAddr = _createToken();
        vm.prank(alice);
        pump.buy{value: 0.2 ether}(tokenAddr, 0);

        ReentrantSeller seller = new ReentrantSeller(pump, tokenAddr);
        uint256 held = ERC20Token(tokenAddr).balanceOf(alice);
        vm.prank(alice);
        ERC20Token(tokenAddr).transfer(address(seller), held);

        (uint256 n0, uint256 t0) = pump.pumpReserve(tokenAddr);
        uint256 kBefore = (VIRTUAL_AMOUNT + n0) * t0;

        seller.sellWithReentry(held / 2, held / 4);

        assertTrue(seller.entered(), "the re-entrant call must actually have run");
        (uint256 n1, uint256 t1) = pump.pumpReserve(tokenAddr);
        assertGe((VIRTUAL_AMOUNT + n1) * t1, kBefore, "K must not fall across a re-entrant sell");
        assertLe(n1, GRADUATION_AMOUNT);
        assertGe(address(pump).balance, n1, "curve must stay solvent against its own ledger");
    }

    function test_ReentrantGraduate_IsRejected() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        ReentrantGraduator actor = new ReentrantGraduator(pump, tokenAddr);
        vm.prank(alice);
        ERC20Token(tokenAddr).transfer(address(actor), 1 ether);

        actor.sellWithReentry(1 ether);
        assertTrue(actor.entered());
        assertFalse(actor.innerSucceeded(), "a re-entrant graduate must not slip through");
        assertFalse(pump.isGraduate(tokenAddr));
    }

    uint256 constant BAND_LOWER_BPS = 9901;
    uint256 constant BAND_UPPER_BPS = 10101;

    function _observedGraduationSqrtPrice() internal returns (uint160) {
        MockV3Pool scratchPool = new MockV3Pool();
        address prevPool = factory.mockPool();
        factory.setMockPool(address(scratchPool));

        address scratch = _createTokenAs(bob);
        _buyToGraduation(scratch);
        pump.graduate(scratch);

        factory.setMockPool(prevPool);
        return scratchPool.storedSqrtPriceX96();
    }

    function _skewedSqrtPrice(uint160 target, uint256 priceBps) internal pure returns (uint160) {
        return uint160(Math.sqrt(Math.mulDiv(uint256(target) * uint256(target), priceBps, 10000)));
    }

    function _preInitializePoolAt(address tokenAddr, uint160 target, uint256 priceBps) internal {
        (address tkn0, address tkn1) =
            tokenAddr < wrappedNative ? (tokenAddr, wrappedNative) : (wrappedNative, tokenAddr);
        MockV3Pool hostile = new MockV3Pool();
        hostile.setSlot0(_skewedSqrtPrice(target, priceBps));
        factory.setMockPool(address(hostile));
        factory.createPool(tkn0, tkn1, 10000);
    }

    function _tokenAtCapWithTarget() internal returns (address tokenAddr, uint160 target) {
        target = _observedGraduationSqrtPrice();
        tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);
    }

    function _graduationSucceedsAt(address tokenAddr, MockV3Pool p, uint160 target, uint256 priceBps)
        internal
        returns (bool ok)
    {
        uint256 snap = vm.snapshotState();
        p.setSlot0(_skewedSqrtPrice(target, priceBps));
        try pump.graduate(tokenAddr) {
            ok = true;
        } catch {
            ok = false;
        }
        vm.revertToState(snap);
    }

    function test_H1_MeasureToleratedPriceBand() public {
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, 10000);
        (address tkn0, address tkn1) =
            tokenAddr < wrappedNative ? (tokenAddr, wrappedNative) : (wrappedNative, tokenAddr);
        MockV3Pool p = MockV3Pool(factory.getPool(tkn0, tkn1, 10000));

        assertTrue(_graduationSucceedsAt(tokenAddr, p, target, 10000), "on-target must graduate");

        uint256 lo = 8000;
        uint256 hi = 10000;
        while (hi - lo > 1) {
            uint256 mid = (lo + hi) / 2;
            if (_graduationSucceedsAt(tokenAddr, p, target, mid)) hi = mid;
            else lo = mid;
        }
        uint256 lowerEdge = hi;

        lo = 10000;
        hi = 12000;
        while (hi - lo > 1) {
            uint256 mid = (lo + hi) / 2;
            if (_graduationSucceedsAt(tokenAddr, p, target, mid)) lo = mid;
            else hi = mid;
        }
        uint256 upperEdge = lo;

        emit log_named_uint("tolerated band lower edge (bps of target price)", lowerEdge);
        emit log_named_uint("tolerated band upper edge (bps of target price)", upperEdge);

        uint256 snap = vm.snapshotState();
        p.setSlot0(_skewedSqrtPrice(target, lowerEdge));
        uint256 collectorBefore = feeCollector.balance;
        pump.graduate(tokenAddr);
        uint256 diverted = feeCollector.balance - collectorBefore;
        vm.revertToState(snap);

        snap = vm.snapshotState();
        p.setSlot0(_skewedSqrtPrice(target, upperEdge));
        uint256 heldBefore = ERC20Token(tokenAddr).balanceOf(address(pump));
        uint256 burnedBefore = ERC20Token(tokenAddr).balanceOf(address(0xdead));
        pump.graduate(tokenAddr);
        uint256 burned = ERC20Token(tokenAddr).balanceOf(address(0xdead)) - burnedBefore;
        vm.revertToState(snap);

        emit log_named_uint("max native diverted to treasury (bps of raise)", (diverted * 10000) / GRADUATION_AMOUNT);
        emit log_named_uint("max token burned instead of LP  (bps of LP)   ", (burned * 10000) / heldBefore);

        assertGe(lowerEdge, 9880, "lower edge far below the 99% min implies the guard is not binding");
        assertLe(lowerEdge, 9920, "lower edge above 99.2% implies a tighter guard than 99%");
        assertGe(upperEdge, 10080, "upper edge below 100.8%");
        assertLe(upperEdge, 10120, "upper edge above 101.2%");
        assertLe(diverted, (GRADUATION_AMOUNT * 1) / 100, "native diversion must stay under the 1% min");
        assertLe(burned, (heldBefore * 12) / 1000, "token burn must stay under the 1% min");
    }

    function test_H1_Graduate_RevertsWhenPoolPreInitializedBelowBand() public {
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, 9000);

        vm.expectRevert("Price slippage check");
        pump.graduate(tokenAddr);

        assertFalse(pump.isGraduate(tokenAddr), "graduation flag must roll back with the revert");
        (uint256 nativeRes,) = pump.pumpReserve(tokenAddr);
        assertEq(nativeRes, GRADUATION_AMOUNT, "reserves must survive a failed graduation");
    }

    function test_H1_Graduate_RevertsWhenPoolPreInitializedAboveBand() public {
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, 11000);

        vm.expectRevert("Price slippage check");
        pump.graduate(tokenAddr);
    }

    function test_H1_StuckToken_StillAllowsSelling() public {
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, 9000);

        vm.expectRevert("Price slippage check");
        pump.graduate(tokenAddr);

        uint256 held = ERC20Token(tokenAddr).balanceOf(alice);
        vm.startPrank(alice);
        ERC20Token(tokenAddr).approve(address(pump), held);
        uint256 out = pump.sell(tokenAddr, held / 2, 0);
        vm.stopPrank();
        assertGt(out, 0, "sellers must keep their exit while a token is stuck");
    }

    function test_H1_StuckTokenIsRecoverable() public {
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, 9000);

        vm.expectRevert("Price slippage check");
        pump.graduate(tokenAddr);

        (address tkn0, address tkn1) =
            tokenAddr < wrappedNative ? (tokenAddr, wrappedNative) : (wrappedNative, tokenAddr);
        MockV3Pool(factory.getPool(tkn0, tkn1, 10000)).setSlot0(target);

        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_H1_SkimAtLowerBandEdge() public {
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, BAND_LOWER_BPS);

        uint256 collectorBefore = feeCollector.balance;
        pump.graduate(tokenAddr);
        uint256 diverted = feeCollector.balance - collectorBefore;

        assertGt(diverted, 0, "an off-target pool diverts native away from the LP");
        assertLe(diverted, (GRADUATION_AMOUNT * 1) / 100, "the 99% min bounds the diversion at 1%");
        emit log_named_decimal_uint("native diverted at the lower edge", diverted, 18);
        emit log_named_uint("           as bps of raise", (diverted * 10000) / GRADUATION_AMOUNT);
    }

    function test_H1_SkimAtUpperBandEdge() public {
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, BAND_UPPER_BPS);

        uint256 burnedBefore = ERC20Token(tokenAddr).balanceOf(address(0xdead));
        uint256 held = ERC20Token(tokenAddr).balanceOf(address(pump));
        pump.graduate(tokenAddr);
        uint256 burned = ERC20Token(tokenAddr).balanceOf(address(0xdead)) - burnedBefore;

        assertGt(burned, 0, "an off-target pool burns token that should have been LP");
        assertLe(burned, (held * 12) / 1000, "the 99% min bounds the burn at 1%");
        emit log_named_uint("token burned at the upper edge (bps of LP)", (burned * 10000) / held);
    }

    function testFuzz_H1_BandBoundary(uint256 priceBps) public {
        priceBps = bound(priceBps, 8000, 12500);
        (address tokenAddr, uint160 target) = _tokenAtCapWithTarget();
        _preInitializePoolAt(tokenAddr, target, priceBps);

        uint256 collectorBefore = feeCollector.balance;
        uint256 held = ERC20Token(tokenAddr).balanceOf(address(pump));

        try pump.graduate(tokenAddr) {
            assertTrue(priceBps >= BAND_LOWER_BPS && priceBps <= BAND_UPPER_BPS, "succeeded outside the band");
            uint256 diverted = feeCollector.balance - collectorBefore;
            uint256 burned = ERC20Token(tokenAddr).balanceOf(address(0xdead));
            assertLe(diverted, (GRADUATION_AMOUNT * 1) / 100, "native diversion exceeded the 1% min");
            assertLe(burned, (held * 12) / 1000, "token burn exceeded the 1% min");
        } catch {
            assertTrue(priceBps < BAND_LOWER_BPS || priceBps > BAND_UPPER_BPS, "reverted inside the band");
        }
    }

}

contract JunoBondingCurveV1_1LowWrappedTest is Test {
    event Graduation(address indexed sender, address tokenAddr);

    JunoBondingCurveV1_1 public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;

    address public alice;
    address public wrappedNative = address(1);

    uint256 constant CREATE_FEE = 0.001 ether;
    uint256 constant VIRTUAL_AMOUNT = 0.34 ether;
    uint256 constant GRADUATION_AMOUNT = 0.4 ether;
    uint256 constant PUMP_FEE = 100;

    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    receive() external payable {}
    fallback() external payable {}

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();

        alice = makeAddr("alice");
        factory.setMockPool(address(pool));
        posManager.setWrappedNative(wrappedNative);
        posManager.setPoolFactory(address(factory));
        pump = new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), address(this), VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );
        pump.setFee(CREATE_FEE, PUMP_FEE);

        vm.deal(alice, 100 ether);
    }

    function _createToken() internal returns (address) {
        vm.prank(alice);
        return pump.createToken{value: CREATE_FEE}("TestToken", "TT", "logo", "desc", "l1", "l2", "l3");
    }

    function _buyToGraduation(address tokenAddr) internal {
        uint256 buyStep = 0.01 ether;
        while (true) {
            (uint256 nativeRes,) = pump.pumpReserve(tokenAddr);
            if (nativeRes >= GRADUATION_AMOUNT) {
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
        assertEq(amount0Min, (amount0Desired * 99) / 100);
        assertEq(amount1Min, (amount1Desired * 99) / 100);
    }

    function test_Graduate_ExistingPoolZeroSlot0_ProductionOrdering() public {
        address tokenAddr = _createToken();
        _buyToGraduation(tokenAddr);

        factory.createPool(wrappedNative, tokenAddr, 10000);

        pump.graduate(tokenAddr);
        assertTrue(pool.initialized());
    }
}

contract JunoBondingCurveV1_1ProductionConfigTest is Test {
    JunoBondingCurveV1_1 public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;

    address public alice;
    address public wrappedNative = address(1);

    uint256 constant CREATE_FEE = 0.1 ether;
    uint256 constant VIRTUAL_AMOUNT = 3400 ether;
    uint256 constant GRADUATION_AMOUNT = 4000 ether;
    uint256 constant CURVE_RESERVE = 1267592592592592592592592592;
    uint256 constant PUMP_FEE = 100;

    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    receive() external payable {}
    fallback() external payable {}

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();
        factory.setMockPool(address(pool));
        posManager.setWrappedNative(wrappedNative);
        posManager.setPoolFactory(address(factory));

        pump = new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), address(this), VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );
        pump.setFee(CREATE_FEE, PUMP_FEE);

        alice = makeAddr("alice");
        vm.deal(alice, 100 ether);
    }

    function _createToken() internal returns (address) {
        vm.prank(alice);
        return pump.createToken{value: CREATE_FEE}("TestToken", "TT", "logo", "desc", "l1", "l2", "l3");
    }

    function test_Create_FirstBuyWorks() public {
        address tokenAddr = _createToken();
        (uint256 nat0, uint256 tok0) = pump.pumpReserve(tokenAddr);
        assertEq(nat0, 0);
        assertEq(tok0, CURVE_RESERVE);

        vm.prank(alice);
        uint256 out = pump.buy{value: 1 ether}(tokenAddr, 0);
        assertGt(out, 0);

        uint256 fee = (1 ether * PUMP_FEE) / 10000;
        (uint256 nat1, uint256 tok1) = pump.pumpReserve(tokenAddr);
        assertEq(nat1, 1 ether - fee);
        assertEq(tok1, CURVE_RESERVE - out);
    }

    function test_Graduate_ProductionMagnitude_EncoderInRange() public {
        address tokenAddr = _createToken();
        _setReserves(tokenAddr, GRADUATION_AMOUNT, CURVE_RESERVE);

        pump.graduate(tokenAddr);

        uint160 sqrtP = pool.storedSqrtPriceX96();
        assertGe(sqrtP, MIN_SQRT_RATIO);
        assertLt(sqrtP, MAX_SQRT_RATIO);
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_CurveReserve_MatchesProductionConstant() public {
        assertEq(pump.curveReserve(), CURVE_RESERVE);
        address tokenAddr = _createToken();
        (, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
        assertEq(tokenReserve, CURVE_RESERVE);
    }

    function test_Graduate_ResidualIsDust_AcrossBuyPaths() public {
        uint256[4] memory steps = [uint256(4000 ether), 1000 ether, 100 ether, 25 ether];
        for (uint256 i; i < steps.length; i++) {
            address tokenAddr = _createToken();
            vm.deal(alice, 20000 ether);
            while (true) {
                (uint256 nat,) = pump.pumpReserve(tokenAddr);
                if (nat >= GRADUATION_AMOUNT) break;
                vm.prank(alice);
                pump.buy{value: steps[i]}(tokenAddr, 0);
            }

            (uint256 nativeReserve, uint256 tokenReserve) = pump.pumpReserve(tokenAddr);
            assertEq(nativeReserve, GRADUATION_AMOUNT);

            uint256 tokenLiquidity = Math.mulDiv(tokenReserve, nativeReserve, VIRTUAL_AMOUNT + nativeReserve);
            uint256 balance = ERC20Token(tokenAddr).balanceOf(address(pump));
            assertGe(balance, tokenLiquidity);
            assertLt(balance - tokenLiquidity, 1 ether);
        }
    }

    function _setReserves(address tokenAddr, uint256 native, uint256 token) internal {
        bytes32 base = keccak256(abi.encode(tokenAddr, uint256(0)));
        vm.store(address(pump), base, bytes32(native));
        vm.store(address(pump), bytes32(uint256(base) + 1), bytes32(token));
        vm.deal(address(pump), address(pump).balance + native);
    }
}

contract GasHungryReceiver {
    uint256 public sink;

    receive() external payable {
        sink += 1;
        sink += block.timestamp;
    }

    fallback() external payable {
        sink += 1;
        sink += block.timestamp;
    }

    function buyOn(JunoBondingCurveV1_1 pump, address tokenAddr, uint256 value) external returns (uint256) {
        return pump.buy{value: value}(tokenAddr, 0);
    }

    function sellOn(JunoBondingCurveV1_1 pump, address tokenAddr, uint256 amount) external returns (uint256) {
        ERC20Token(tokenAddr).approve(address(pump), amount);
        return pump.sell(tokenAddr, amount, 0);
    }
}

contract RejectingReceiver {
    receive() external payable {
        revert("nope");
    }

    function buyOn(JunoBondingCurveV1_1 pump, address tokenAddr, uint256 value) external returns (uint256) {
        return pump.buy{value: value}(tokenAddr, 0);
    }

    function sellOn(JunoBondingCurveV1_1 pump, address tokenAddr, uint256 amount) external returns (uint256) {
        ERC20Token(tokenAddr).approve(address(pump), amount);
        return pump.sell(tokenAddr, amount, 0);
    }
}

contract ReentrantSeller {
    JunoBondingCurveV1_1 public immutable pump;
    address public immutable token;
    bool public entered;
    uint256 public reentryAmount;

    constructor(JunoBondingCurveV1_1 _pump, address _token) {
        pump = _pump;
        token = _token;
    }

    receive() external payable {
        if (entered) return;
        entered = true;
        try pump.sell(token, reentryAmount, 0) returns (uint256) {} catch {}
    }

    function sellWithReentry(uint256 amount, uint256 _reentryAmount) external returns (uint256) {
        reentryAmount = _reentryAmount;
        ERC20Token(token).approve(address(pump), type(uint256).max);
        return pump.sell(token, amount, 0);
    }
}

contract ReentrantGraduator {
    JunoBondingCurveV1_1 public immutable pump;
    address public immutable token;
    bool public entered;
    bool public innerSucceeded;

    constructor(JunoBondingCurveV1_1 _pump, address _token) {
        pump = _pump;
        token = _token;
    }

    receive() external payable {
        if (entered) return;
        entered = true;
        try pump.graduate(token) returns (bool) {
            innerSucceeded = true;
        } catch {
            innerSucceeded = false;
        }
    }

    function sellWithReentry(uint256 amount) external returns (uint256) {
        ERC20Token(token).approve(address(pump), type(uint256).max);
        return pump.sell(token, amount, 0);
    }
}

contract ReentrantBuyer {
    JunoBondingCurveV1_1 public immutable pump;
    address public immutable token;
    bool public entered;
    uint256 public reentryValue;

    constructor(JunoBondingCurveV1_1 _pump, address _token) {
        pump = _pump;
        token = _token;
    }

    receive() external payable {
        if (entered) return;
        entered = true;
        try pump.buy{value: reentryValue}(token, 0) returns (uint256) {} catch {}
    }

    function buyOverCap(uint256 value, uint256 _reentryValue) external returns (uint256) {
        reentryValue = _reentryValue;
        return pump.buy{value: value}(token, 0);
    }
}

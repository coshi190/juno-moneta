// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/FeeCollector.sol";
import "../src/ERC20Token.sol";
import "../src/interfaces/v3-core/IUniswapV3Factory.sol";
import "../src/interfaces/v3-core/IUniswapV3Pool.sol";
import "../src/interfaces/v3-periphery/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IKKUB {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256);
}

contract JunoBondingCurveV1_1ForkTest is Test {
    address constant V3_FACTORY = 0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C;
    address constant V3_POS_MANAGER = 0xb6b76870549893c6b59E7e979F254d0F9Cca4Cc9;
    address constant V3_SWAP_ROUTER = 0x3F7582E36843FF79F173c7DC19f517832496f2D8;
    address constant KKUB = 0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5;
    uint24 constant FEE_TIER = 10000;

    uint256 constant VIRTUAL_AMOUNT = 3400 ether;
    uint256 constant GRADUATION_AMOUNT = 4000 ether;
    uint256 constant CREATE_FEE = 0.1 ether;
    uint256 constant PUMP_FEE = 100;
    uint256 constant CREATOR_SHARE_BPS = 5000;

    JunoBondingCurveV1_1 internal pump;
    FeeCollector internal collector;
    address internal treasury;
    address internal alice;
    address internal attacker;

    bool internal enabled;

    function setUp() public {
        enabled = vm.envOr("FORK_TESTS", false);
        if (!enabled) return;

        vm.createSelectFork(vm.envOr("KUB_MAINNET_RPC", string("https://rpc.bitkubchain.io")));

        treasury = makeAddr("treasury");
        alice = makeAddr("alice");
        attacker = makeAddr("attacker");

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        collector = new FeeCollector(treasury, CREATOR_SHARE_BPS, predicted);
        pump = new JunoBondingCurveV1_1(
            KKUB, V3_FACTORY, V3_POS_MANAGER, address(collector), VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );
        require(address(pump) == predicted, "curve address mismatch");
        collector.setCurveFee(CREATE_FEE, PUMP_FEE);

        vm.deal(alice, 10_000 ether);
        vm.deal(attacker, 10_000 ether);
    }

    modifier onFork() {
        if (!enabled) {
            vm.skip(true);
            return;
        }
        _;
    }

    function _order(address tokenAddr) internal pure returns (address t0, address t1) {
        return tokenAddr < KKUB ? (tokenAddr, KKUB) : (KKUB, tokenAddr);
    }

    function _poolOf(address tokenAddr) internal view returns (address) {
        (address t0, address t1) = _order(tokenAddr);
        return IUniswapV3Factory(V3_FACTORY).getPool(t0, t1, FEE_TIER);
    }

    function _tokenAtCap() internal returns (address tokenAddr) {
        vm.prank(alice);
        tokenAddr = pump.createToken{value: CREATE_FEE}("Fork", "FRK", "l", "d", "1", "2", "3");
        vm.prank(alice);
        pump.buy{value: GRADUATION_AMOUNT * 2}(tokenAddr, 0);
        (uint256 nativeRes,) = pump.pumpReserve(tokenAddr);
        assertEq(nativeRes, GRADUATION_AMOUNT, "curve should sit exactly on the cap");
    }

    function _observeTarget(address tokenAddr) internal returns (uint160 target) {
        uint256 snap = vm.snapshotState();
        pump.graduate(tokenAddr);
        (target,,,,,,) = IUniswapV3Pool(_poolOf(tokenAddr)).slot0();
        vm.revertToState(snap);
    }

    function _skew(uint160 target, uint256 priceBps) internal pure returns (uint160) {
        return uint160(Math.sqrt(Math.mulDiv(uint256(target) * uint256(target), priceBps, 10000)));
    }

    function _preInitializeAt(address tokenAddr, uint160 target, uint256 priceBps) internal returns (address pool) {
        (address t0, address t1) = _order(tokenAddr);
        vm.prank(attacker);
        pool = IUniswapV3Factory(V3_FACTORY).createPool(t0, t1, FEE_TIER);
        vm.prank(attacker);
        IUniswapV3Pool(pool).initialize(_skew(target, priceBps));
    }

    function _graduationSucceedsAt(address tokenAddr, uint160 target, uint256 priceBps) internal returns (bool ok) {
        uint256 snap = vm.snapshotState();
        _preInitializeAt(tokenAddr, target, priceBps);
        try pump.graduate(tokenAddr) {
            ok = true;
        } catch {
            ok = false;
        }
        vm.revertToState(snap);
    }

    function _displacementAt(address tokenAddr, uint160 target, uint256 priceBps)
        internal
        returns (uint256 divertedNative, uint256 burnedToken, uint256 creatorGain, uint256 heldBefore)
    {
        uint256 snap = vm.snapshotState();
        _preInitializeAt(tokenAddr, target, priceBps);

        uint256 treasuryBefore = collector.claimable(treasury, address(0));
        uint256 creatorBefore = collector.claimable(alice, address(0));
        uint256 burnedBefore = ERC20Token(tokenAddr).balanceOf(address(0xdead));
        heldBefore = ERC20Token(tokenAddr).balanceOf(address(pump));

        pump.graduate(tokenAddr);

        divertedNative = collector.claimable(treasury, address(0)) - treasuryBefore;
        creatorGain = collector.claimable(alice, address(0)) - creatorBefore;
        burnedToken = ERC20Token(tokenAddr).balanceOf(address(0xdead)) - burnedBefore;
        vm.revertToState(snap);
    }

    function testFork_MainnetWiringIsConsistent() public onFork {
        assertEq(INonfungiblePositionManager(V3_POS_MANAGER).WETH9(), KKUB, "posManager.WETH9() != KKUB");
        assertEq(INonfungiblePositionManager(V3_POS_MANAGER).factory(), V3_FACTORY, "posManager.factory() mismatch");
        assertEq(address(pump.wrappedNative()), INonfungiblePositionManager(V3_POS_MANAGER).WETH9());
        assertGt(IUniswapV3Factory(V3_FACTORY).feeAmountTickSpacing(FEE_TIER), 0, "1% fee tier not enabled");
        assertEq(IUniswapV3Factory(V3_FACTORY).feeAmountTickSpacing(FEE_TIER), 200, "unexpected tick spacing");
    }

    function testFork_Graduate_HappyPath() public onFork {
        address tokenAddr = _tokenAtCap();
        assertEq(_poolOf(tokenAddr), address(0), "pool should not exist yet");

        uint256 burnedNftsBefore = INonfungiblePositionManager(V3_POS_MANAGER).balanceOf(address(0xdead));
        uint256 treasuryBefore = collector.claimable(treasury, address(0));

        pump.graduate(tokenAddr);

        address pool = _poolOf(tokenAddr);
        assertTrue(pool != address(0), "graduation must create the pool");
        (uint160 sqrtP,,,,,,) = IUniswapV3Pool(pool).slot0();
        assertGt(sqrtP, 0, "pool must be initialized");
        assertGt(IUniswapV3Pool(pool).liquidity(), 0, "pool must hold the seeded liquidity");

        assertEq(
            INonfungiblePositionManager(V3_POS_MANAGER).balanceOf(address(0xdead)),
            burnedNftsBefore + 1,
            "LP position must be burned to 0xdead"
        );

        uint256 diverted = collector.claimable(treasury, address(0)) - treasuryBefore;
        assertEq(IKKUB(KKUB).balanceOf(pool) + diverted, GRADUATION_AMOUNT, "raise must be fully accounted");
        assertLt(diverted, 0.01 ether, "on-target graduation should divert dust only");
        assertEq(address(pump).balance, 0, "curve must not retain native after graduating");
        assertEq(ERC20Token(tokenAddr).balanceOf(address(pump)), 0, "curve must not retain token");
    }

    function testFork_Graduate_RevertsWhenPoolPreInitializedBelowBand() public onFork {
        address tokenAddr = _tokenAtCap();
        uint160 target = _observeTarget(tokenAddr);
        _preInitializeAt(tokenAddr, target, 9000);

        vm.expectRevert(bytes("Price slippage check"));
        pump.graduate(tokenAddr);

        assertFalse(pump.isGraduate(tokenAddr), "flag must roll back");
        (uint256 nativeRes,) = pump.pumpReserve(tokenAddr);
        assertEq(nativeRes, GRADUATION_AMOUNT, "reserves must survive a failed graduation");
    }

    function testFork_Graduate_RevertsWhenPoolPreInitializedAboveBand() public onFork {
        address tokenAddr = _tokenAtCap();
        uint160 target = _observeTarget(tokenAddr);
        _preInitializeAt(tokenAddr, target, 11000);

        vm.expectRevert(bytes("Price slippage check"));
        pump.graduate(tokenAddr);
    }

    function testFork_MeasureToleratedPriceBand() public onFork {
        address tokenAddr = _tokenAtCap();
        uint160 target = _observeTarget(tokenAddr);

        uint256 lo = 8000;
        uint256 hi = 10000;
        while (hi - lo > 1) {
            uint256 mid = (lo + hi) / 2;
            if (_graduationSucceedsAt(tokenAddr, target, mid)) hi = mid;
            else lo = mid;
        }
        uint256 lowerEdge = hi;

        lo = 10000;
        hi = 12000;
        while (hi - lo > 1) {
            uint256 mid = (lo + hi) / 2;
            if (_graduationSucceedsAt(tokenAddr, target, mid)) lo = mid;
            else hi = mid;
        }
        uint256 upperEdge = lo;

        emit log_named_uint("REAL V3 tolerated band lower edge (bps)", lowerEdge);
        emit log_named_uint("REAL V3 tolerated band upper edge (bps)", upperEdge);

        emit log_named_string("launch token is", tokenAddr < KKUB ? "token0 (KKUB is token1)" : "token1 (KKUB is token0)");

        (uint256 divertedLo, uint256 burnedLo, uint256 creatorLo, uint256 heldLo) = _displacementAt(tokenAddr, target, lowerEdge);
        (uint256 divertedHi, uint256 burnedHi, uint256 creatorHi, uint256 heldHi) = _displacementAt(tokenAddr, target, upperEdge);

        uint256 divertedNative = divertedLo > divertedHi ? divertedLo : divertedHi;
        uint256 burnedToken = burnedLo > burnedHi ? burnedLo : burnedHi;
        uint256 heldBefore = heldLo > heldHi ? heldLo : heldHi;

        emit log_named_uint("native diverted at lower edge (bps of raise)", (divertedLo * 10000) / GRADUATION_AMOUNT);
        emit log_named_uint("native diverted at upper edge (bps of raise)", (divertedHi * 10000) / GRADUATION_AMOUNT);
        emit log_named_uint("token burned at lower edge   (bps of LP)   ", (burnedLo * 10000) / heldLo);
        emit log_named_uint("token burned at upper edge   (bps of LP)   ", (burnedHi * 10000) / heldHi);
        emit log_named_decimal_uint("worst-case native displaced from LP", divertedNative, 18);

        assertGe(lowerEdge, 9880);
        assertLe(lowerEdge, 9920);
        assertGe(upperEdge, 10080);
        assertLe(upperEdge, 10120);
        assertLe(divertedNative, (GRADUATION_AMOUNT * 1) / 100, "diversion must stay under the 1% min");
        assertLe(burnedToken, (heldBefore * 12) / 1000, "burn must stay under the 1% min");
        assertGt(divertedNative + burnedToken, 0, "an off-target pool must displace something");

        assertEq(creatorLo, 0, "graduation dust must not reach the creator");
        assertEq(creatorHi, 0, "graduation dust must not reach the creator");
    }

    function testFork_StuckToken_StillAllowsSelling() public onFork {
        address tokenAddr = _tokenAtCap();
        uint160 target = _observeTarget(tokenAddr);
        _preInitializeAt(tokenAddr, target, 9000);

        vm.expectRevert(bytes("Price slippage check"));
        pump.graduate(tokenAddr);

        uint256 held = ERC20Token(tokenAddr).balanceOf(alice);
        uint256 before = alice.balance;
        vm.startPrank(alice);
        ERC20Token(tokenAddr).approve(address(pump), held);
        pump.sell(tokenAddr, held / 2, 0);
        vm.stopPrank();
        assertGt(alice.balance, before, "holders must keep their exit while a token is stuck");
    }

    function _seedPool(address tokenAddr, address rescuer) internal {
        uint256 seedToken = 1_000 ether;
        uint256 seedKkub = 0.01 ether;

        vm.startPrank(rescuer);
        IKKUB(KKUB).deposit{value: 500 ether}();
        IKKUB(KKUB).approve(V3_POS_MANAGER, type(uint256).max);
        ERC20Token(tokenAddr).approve(V3_POS_MANAGER, type(uint256).max);

        (address t0, address t1) = _order(tokenAddr);
        (uint256 a0, uint256 a1) = tokenAddr < KKUB ? (seedToken, seedKkub) : (seedKkub, seedToken);
        INonfungiblePositionManager(V3_POS_MANAGER).mint(
            INonfungiblePositionManager.MintParams({
                token0: t0,
                token1: t1,
                fee: FEE_TIER,
                tickLower: -887200,
                tickUpper: 887200,
                amount0Desired: a0,
                amount1Desired: a1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: rescuer,
                deadline: block.timestamp + 1200
            })
        );
        vm.stopPrank();
    }

    function testFork_StuckTokenIsRecoverableViaRunbook() public onFork {
        address tokenAddr = _tokenAtCap();
        uint160 target = _observeTarget(tokenAddr);
        address pool = _preInitializeAt(tokenAddr, target, 9000);

        vm.expectRevert(bytes("Price slippage check"));
        pump.graduate(tokenAddr);

        assertEq(IUniswapV3Pool(pool).liquidity(), 0, "a front-run pool starts with no liquidity");

        address rescuer = makeAddr("rescuer");
        vm.deal(rescuer, 1_000 ether);
        vm.prank(alice);
        ERC20Token(tokenAddr).transfer(rescuer, 50_000_000 ether);

        _seedPool(tokenAddr, rescuer);
        assertGt(IUniswapV3Pool(pool).liquidity(), 0, "seed must give the pool something to swap against");

        _repairPrice(tokenAddr, rescuer, target);

        (uint160 repaired,,,,,,) = IUniswapV3Pool(pool).slot0();
        uint256 gapBps = repaired > target
            ? ((repaired - target) * 10000) / target
            : ((target - repaired) * 10000) / target;
        emit log_named_uint("post-repair gap to target (sqrtPrice bps)", gapBps);
        assertLe(gapBps, 25, "runbook TOLERANCE_BP: repair must land within 25 bps of target");

        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr), "the runbook must actually unstick the token");
    }

    function _repairPrice(address tokenAddr, address rescuer, uint160 target) internal {
        (address t0, address t1) = _order(tokenAddr);
        (uint160 current,,,,,,) = IUniswapV3Pool(_poolOf(tokenAddr)).slot0();
        bool zeroForOne = target < current;
        address tokenIn = zeroForOne ? t0 : t1;

        vm.startPrank(rescuer);
        IERC20(tokenIn).approve(V3_SWAP_ROUTER, type(uint256).max);
        assertGt(IERC20(tokenIn).balanceOf(rescuer), 0, "rescuer needs input left after seeding");
        ISwapRouter(V3_SWAP_ROUTER).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: zeroForOne ? t1 : t0,
                fee: FEE_TIER,
                recipient: rescuer,
                amountIn: IERC20(tokenIn).balanceOf(rescuer),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: target
            })
        );
        vm.stopPrank();
    }

    function testFork_GraduationAccountingClosesExactly() public onFork {
        address tokenAddr = _tokenAtCap();
        uint256 treasuryBefore = collector.claimable(treasury, address(0));

        assertEq(address(pump).balance, GRADUATION_AMOUNT, "curve holds exactly the raise before graduating");
        pump.graduate(tokenAddr);

        uint256 diverted = collector.claimable(treasury, address(0)) - treasuryBefore;
        uint256 intoPool = IKKUB(KKUB).balanceOf(_poolOf(tokenAddr));

        assertEq(intoPool + diverted, GRADUATION_AMOUNT, "every wei of the raise is either LP or treasury");
        assertEq(address(pump).balance, 0, "no native may be stranded in the curve");
        assertEq(address(V3_POS_MANAGER).balance, 0, "refundETH must leave nothing behind");
    }

    function _createTokenOrdered(bool wantToken0) internal returns (address tokenAddr) {
        for (uint256 i; i < 64; i++) {
            vm.prank(alice);
            address t = pump.createToken{value: CREATE_FEE}("Fork", "FRK", "l", "d", "1", "2", "3");
            if ((t < KKUB) == wantToken0) return t;
        }
        revert("no token with the requested KKUB ordering in 64 tries");
    }

    function _edgeFor(bool wantToken0, uint256 skewBps) internal pure returns (uint256) {
        return wantToken0 ? 10000 + skewBps : 10000 - skewBps;
    }

    function _maxFavourableSkew(address tokenAddr, uint160 target, bool wantToken0)
        internal
        returns (uint256 skew)
    {
        uint256 lo = 0;
        uint256 hi = 2000;
        while (hi - lo > 1) {
            uint256 mid = (lo + hi) / 2;
            if (_graduationSucceedsAt(tokenAddr, target, _edgeFor(wantToken0, mid))) lo = mid;
            else hi = mid;
        }
        skew = lo;
    }

    function _dumpAll(address tokenAddr, address who) internal {
        uint256 amountIn = ERC20Token(tokenAddr).balanceOf(who);
        if (amountIn == 0) return;
        vm.startPrank(who);
        IERC20(tokenAddr).approve(V3_SWAP_ROUTER, type(uint256).max);
        ISwapRouter(V3_SWAP_ROUTER).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenAddr,
                tokenOut: KKUB,
                fee: FEE_TIER,
                recipient: who,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();
    }

    function _roundTrip(uint256 tail, bool wantToken0, uint256 skewBps)
        internal
        returns (int256 net, uint256 usedSkew)
    {
        address tokenAddr = _createTokenOrdered(wantToken0);

        uint256 seed = ((GRADUATION_AMOUNT - tail) * 10000) / (10000 - PUMP_FEE);
        vm.prank(alice);
        pump.buy{value: seed}(tokenAddr, 0);
        (uint256 seeded,) = pump.pumpReserve(tokenAddr);
        assertLt(seeded, GRADUATION_AMOUNT, "alice must leave a tail for the attacker");

        assertEq(IKKUB(KKUB).balanceOf(attacker), 0, "attacker must start with no KKUB");
        uint256 opened = attacker.balance;

        vm.prank(attacker);
        pump.buy{value: GRADUATION_AMOUNT * 2}(tokenAddr, 0);
        (uint256 nativeRes,) = pump.pumpReserve(tokenAddr);
        assertEq(nativeRes, GRADUATION_AMOUNT, "the clamp must land the attacker exactly on the cap");

        uint160 target = _observeTarget(tokenAddr);
        usedSkew = skewBps == type(uint256).max
            ? _maxFavourableSkew(tokenAddr, target, wantToken0)
            : skewBps;

        _preInitializeAt(tokenAddr, target, _edgeFor(wantToken0, usedSkew));
        vm.prank(attacker);
        pump.graduate(tokenAddr);
        assertTrue(pump.isGraduate(tokenAddr), "a pool inside the band must still admit graduation");

        _dumpAll(tokenAddr, attacker);
        assertEq(ERC20Token(tokenAddr).balanceOf(attacker), 0, "the attacker must fully exit");

        uint256 closed = attacker.balance + IKKUB(KKUB).balanceOf(attacker);
        net = int256(closed) - int256(opened);
    }

    function _netAt(uint256 tail, bool wantToken0, uint256 skewBps) internal returns (int256 net) {
        uint256 snap = vm.snapshotState();
        (net,) = _roundTrip(tail, wantToken0, skewBps);
        vm.revertToState(snap);
    }

    function _profitCurve(bool wantToken0) internal {
        uint256[10] memory tails = [
            uint256(10 ether), 50 ether, 75 ether, 100 ether, 125 ether,
            150 ether, 200 ether, 300 ether, 800 ether, 2000 ether
        ];
        emit log_named_string("launch token sorts as", wantToken0 ? "token0" : "token1");

        int256 best = type(int256).min;
        uint256 bestTail;
        for (uint256 i; i < tails.length; i++) {
            uint256 snap = vm.snapshotState();
            (int256 net, uint256 skew) = _roundTrip(tails[i], wantToken0, type(uint256).max);
            emit log_named_decimal_uint("  tail bought on the curve   ", tails[i], 18);
            emit log_named_uint("        max admitted skew (bps)", skew);
            emit log_named_decimal_int("        attacker net (native) ", net, 18);
            if (net > best) {
                best = net;
                bestTail = tails[i];
            }
            vm.revertToState(snap);
        }
        emit log_named_decimal_uint("PEAK at tail                 ", bestTail, 18);
        emit log_named_decimal_int("PEAK attacker net (native)   ", best, 18);

        assertLe(best, int256(0), "no tail size may profit at 99% minimums");
    }

    function testFork_SkewSkim_IsUnprofitable_TokenIsToken0() public onFork {
        _profitCurve(true);
    }

    function testFork_SkewSkim_IsUnprofitable_TokenIsToken1() public onFork {
        _profitCurve(false);
    }

    function testFork_SkewSkim_IsUnprofitableAcrossTheBand() public onFork {
        uint256 tail = 50 ether;

        for (uint256 ord; ord < 2; ord++) {
            bool wantToken0 = ord == 0;
            uint256 snap = vm.snapshotState();
            (, uint256 maxSkew) = _roundTrip(tail, wantToken0, type(uint256).max);
            vm.revertToState(snap);

            int256 atEdge = _netAt(tail, wantToken0, maxSkew);
            int256 atHalf = _netAt(tail, wantToken0, maxSkew / 2);
            int256 atTarget = _netAt(tail, wantToken0, 0);

            emit log_named_string("ordering                     ", wantToken0 ? "token0" : "token1");
            emit log_named_uint("  max admitted skew (bps)    ", maxSkew);
            emit log_named_decimal_int("  net at the band edge       ", atEdge, 18);
            emit log_named_decimal_int("  net at half the band       ", atHalf, 18);
            emit log_named_decimal_int("  net on target              ", atTarget, 18);

            assertLe(atEdge, int256(0), "the band edge must not be profitable at 99% minimums");
            assertLe(atHalf, int256(0), "half the band must not be profitable");
            assertLe(atTarget, int256(0), "an on-target graduation must not be profitable");
        }
    }

    function testFuzz_Fork_SkewSkim_IsUnprofitable(uint256 tail, bool wantToken0) public onFork {
        tail = bound(tail, 1 ether, 3000 ether);
        (int256 net,) = _roundTrip(tail, wantToken0, type(uint256).max);
        assertLe(net, int256(0), "no position size may profit from the admitted band");
    }
}

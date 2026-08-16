// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/AggRouterJunoswap.sol";
import "./mocks/MockPools.sol";

contract AggRouterJunoswapTest is Test {
    AggRouterJunoswap router;
    MockWETH9 weth;
    MintableERC20 tokenA;
    MintableERC20 tokenB;
    MintableERC20 tokenC;
    FeeOnTransferERC20 fot;

    MockV2Factory v2Factory;
    MockV2Factory v2FactoryLow;
    MockV2Factory v2FactoryND;
    MockV3FactorySim v3Factory;
    MockV3FactorySim pcsFactory;
    MockV3FactorySim klxFactory;
    MockV3FactorySim unknownFactory;

    MockV2Pair pairAB;
    MockV2Pair pairAC;
    MockV2Pair pairCB;
    MockV2Pair pairAW;
    MockV2Pair pairBW;
    MockV2Pair pairABLow;
    MockV2Pair pairAF;
    MockV2Pair pairFB;

    MockV2PairNoData pairABND;
    MockV2PairNoData pairACND;
    MockV2PairNoData pairCBND;

    MockV3PoolSim poolAB;
    MockV3PoolSim poolAC;
    MockV3PoolSim poolCB;
    MockV3PoolSim poolAW;
    MockV3PoolSim poolBW;
    MockV3PoolSim poolFB;
    PancakeMockV3Pool pcsAB;
    KublerxMockV3Pool klxAB;
    RenamedCallbackMockV3Pool unknownAB;

    address user = address(0xA11CE);
    address recipient = address(0xB0B);
    address referrer = address(0xCAFE);
    address collector = address(0xFEE5);

    address constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 constant RESERVE = 100_000 ether;
    bytes32 constant TRANSFER_TOPIC = keccak256("Transfer(address,address,uint256)");

    receive() external payable {}

    function setUp() public {
        weth = new MockWETH9();
        router = new AggRouterJunoswap(address(weth));
        tokenA = new MintableERC20("TokenA", "A", 18);
        tokenB = new MintableERC20("TokenB", "B", 18);
        tokenC = new MintableERC20("TokenC", "C", 18);
        fot = new FeeOnTransferERC20(100);

        v2Factory = new MockV2Factory();
        v2FactoryLow = new MockV2Factory();
        v2FactoryND = new MockV2Factory();
        v3Factory = new MockV3FactorySim();
        pcsFactory = new MockV3FactorySim();
        klxFactory = new MockV3FactorySim();
        unknownFactory = new MockV3FactorySim();

        router.setFactory(address(v2Factory), router.KIND_V2(), 30);
        router.setFactory(address(v2FactoryLow), router.KIND_V2(), 25);
        router.setFactory(address(v2FactoryND), router.KIND_V2_NODATA(), 30);
        router.setFactory(address(v3Factory), router.KIND_V3(), 0);
        router.setFactory(address(pcsFactory), router.KIND_V3(), 0);
        router.setFactory(address(klxFactory), router.KIND_V3(), 0);
        router.setFactory(address(unknownFactory), router.KIND_V3(), 0);

        vm.deal(address(this), 10_000_000 ether);

        pairAB = _newPair(v2Factory, address(tokenA), address(tokenB), 30);
        pairAC = _newPair(v2Factory, address(tokenA), address(tokenC), 30);
        pairCB = _newPair(v2Factory, address(tokenC), address(tokenB), 30);
        pairAW = _newPair(v2Factory, address(tokenA), address(weth), 30);
        pairBW = _newPair(v2Factory, address(tokenB), address(weth), 30);
        pairAF = _newPair(v2Factory, address(tokenA), address(fot), 30);
        pairFB = _newPair(v2Factory, address(fot), address(tokenB), 30);
        pairABLow = _newPair(v2FactoryLow, address(tokenA), address(tokenB), 25);

        pairABND = _newPairND(v2FactoryND, address(tokenA), address(tokenB), 30);
        pairACND = _newPairND(v2FactoryND, address(tokenA), address(tokenC), 30);
        pairCBND = _newPairND(v2FactoryND, address(tokenC), address(tokenB), 30);

        poolAB = _newPool(v3Factory, address(tokenA), address(tokenB), 3000);
        poolAC = _newPool(v3Factory, address(tokenA), address(tokenC), 3000);
        poolCB = _newPool(v3Factory, address(tokenC), address(tokenB), 3000);
        poolAW = _newPool(v3Factory, address(tokenA), address(weth), 3000);
        poolBW = _newPool(v3Factory, address(tokenB), address(weth), 3000);
        poolFB = _newPool(v3Factory, address(fot), address(tokenB), 3000);

        pcsAB = new PancakeMockV3Pool(address(tokenA), address(tokenB), 2500);
        pcsFactory.register(address(pcsAB));
        _fund(address(pcsAB), address(tokenA));
        _fund(address(pcsAB), address(tokenB));

        klxAB = new KublerxMockV3Pool(address(tokenA), address(tokenB), 500);
        klxFactory.register(address(klxAB));
        _fund(address(klxAB), address(tokenA));
        _fund(address(klxAB), address(tokenB));

        unknownAB = new RenamedCallbackMockV3Pool(address(tokenA), address(tokenB), 500);
        unknownFactory.register(address(unknownAB));
        _fund(address(unknownAB), address(tokenA));
        _fund(address(unknownAB), address(tokenB));
    }

    function _fund(address to, address token) internal {
        if (token == address(weth)) {
            weth.deposit{value: RESERVE}();
            weth.transfer(to, RESERVE);
        } else if (token == address(fot)) {
            fot.mint(to, (RESERVE * 10000) / 9900);
        } else {
            MintableERC20(token).mint(to, RESERVE);
        }
    }

    function _newPair(MockV2Factory f, address t0, address t1, uint16 feeBps) internal returns (MockV2Pair p) {
        p = new MockV2Pair(t0, t1, feeBps);
        f.register(address(p));
        _fund(address(p), t0);
        _fund(address(p), t1);
        p.sync();
    }

    function _newPairND(MockV2Factory f, address t0, address t1, uint16 feeBps) internal returns (MockV2PairNoData p) {
        p = new MockV2PairNoData(t0, t1, feeBps);
        f.register(address(p));
        _fund(address(p), t0);
        _fund(address(p), t1);
        p.sync();
    }

    function _newPool(MockV3FactorySim f, address t0, address t1, uint24 fee) internal returns (MockV3PoolSim p) {
        p = new MockV3PoolSim(t0, t1, fee);
        f.register(address(p));
        _fund(address(p), t0);
        _fund(address(p), t1);
    }

    function _v2Out(MockV2Pair pair, address tin, uint256 amtIn) internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 rIn, uint256 rOut) = tin == pair.token0() ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 inWithFee = amtIn * (10000 - pair.feeBps());
        return (inWithFee * rOut) / (rIn * 10000 + inWithFee);
    }

    function _v2OutND(MockV2PairNoData pair, address tin, uint256 amtIn) internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 rIn, uint256 rOut) = tin == pair.token0() ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 inWithFee = amtIn * (10000 - pair.feeBps());
        return (inWithFee * rOut) / (rIn * 10000 + inWithFee);
    }

    function _v3Out(MockV3PoolSim pool, address tin, uint256 amtIn) internal view returns (uint256) {
        address tout = tin == pool.token0() ? pool.token1() : pool.token0();
        uint256 rIn = IERC20(tin).balanceOf(address(pool));
        uint256 rOut = IERC20(tout).balanceOf(address(pool));
        uint256 inWithFee = (amtIn * (1_000_000 - pool.fee())) / 1_000_000;
        return (inWithFee * rOut) / (rIn + inWithFee);
    }

    function _v2Hop(address factory, address tout) internal pure returns (AggRouterJunoswap.Hop memory) {
        return AggRouterJunoswap.Hop({factory: factory, swapData: abi.encode(tout)});
    }

    function _v3Hop(address factory, address tout, uint24 fee) internal pure returns (AggRouterJunoswap.Hop memory) {
        return AggRouterJunoswap.Hop({factory: factory, swapData: abi.encode(tout, fee)});
    }

    function _oneHopLeg(uint256 amountIn, AggRouterJunoswap.Hop memory hop)
        internal
        pure
        returns (AggRouterJunoswap.Leg memory leg)
    {
        leg.amountIn = amountIn;
        leg.hops = new AggRouterJunoswap.Hop[](1);
        leg.hops[0] = hop;
    }

    function _twoHopLeg(uint256 amountIn, AggRouterJunoswap.Hop memory h1, AggRouterJunoswap.Hop memory h2)
        internal
        pure
        returns (AggRouterJunoswap.Leg memory leg)
    {
        leg.amountIn = amountIn;
        leg.hops = new AggRouterJunoswap.Hop[](2);
        leg.hops[0] = h1;
        leg.hops[1] = h2;
    }

    function _params(address tin, address tout, uint256 amountIn, uint256 minOut, bool unwrapOut)
        internal
        view
        returns (AggRouterJunoswap.AggregateParams memory)
    {
        return AggRouterJunoswap.AggregateParams({
            tokenIn: tin,
            tokenOut: tout,
            amountIn: amountIn,
            minAmountOut: minOut,
            recipient: recipient,
            deadline: block.timestamp + 300,
            unwrapOut: unwrapOut,
            referrer: referrer
        });
    }

    function _swap(
        address tin,
        address tout,
        uint256 amountIn,
        uint256 minOut,
        bool unwrapOut,
        AggRouterJunoswap.Leg[] memory legs
    ) internal returns (uint256 out) {
        vm.startPrank(user);
        if (tin != NATIVE) {
            MintableERC20(tin).approve(address(router), amountIn);
            out = router.aggregate(_params(tin, tout, amountIn, minOut, unwrapOut), legs);
        } else {
            out = router.aggregate{value: amountIn}(_params(tin, tout, amountIn, minOut, unwrapOut), legs);
        }
        vm.stopPrank();
    }

    function _legs(uint256 n) internal pure returns (AggRouterJunoswap.Leg[] memory) {
        return new AggRouterJunoswap.Leg[](n);
    }

    function _routerTransfersOf(Vm.Log[] memory logs, address token) internal view returns (uint256 n) {
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == token && logs[i].topics.length == 3 && logs[i].topics[0] == TRANSFER_TOPIC
                    && address(uint160(uint256(logs[i].topics[1]))) == address(router)
            ) ++n;
        }
    }

    function _assertNoCustody() internal view {
        assertEq(tokenA.balanceOf(address(router)), 0, "custody A");
        assertEq(tokenB.balanceOf(address(router)), 0, "custody B");
        assertEq(tokenC.balanceOf(address(router)), 0, "custody C");
        assertEq(weth.balanceOf(address(router)), 0, "custody W");
    }

    function _revertReason(bytes memory ret) internal pure returns (string memory) {
        if (ret.length < 68) return "";
        assembly {
            ret := add(ret, 0x04)
        }
        return abi.decode(ret, (string));
    }

    function test_SplitAcrossTwoDexes() public {
        uint256 amountIn = 1000 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(2);
        legs[0] = _oneHopLeg(600 ether, _v2Hop(address(v2Factory), address(tokenB)));
        legs[1] = _oneHopLeg(400 ether, _v3Hop(address(v3Factory), address(tokenB), 3000));

        uint256 expected = _v2Out(pairAB, address(tokenA), 600 ether) + _v3Out(poolAB, address(tokenA), 400 ether);

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);

        assertEq(out, expected, "summed output");
        assertEq(tokenB.balanceOf(recipient), expected, "recipient received");
        assertEq(tokenA.balanceOf(user), 0, "input fully spent");
        _assertNoCustody();
    }

    function test_LowerFeeFactoryYieldsMoreOutput() public {
        uint256 amountIn = 1000 ether;
        tokenA.mint(user, amountIn * 2);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));
        uint256 out30 = _swap(address(tokenA), address(tokenB), amountIn, 0, false, legs);

        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2FactoryLow), address(tokenB)));
        uint256 out25 = _swap(address(tokenA), address(tokenB), amountIn, 0, false, legs);

        assertGt(out25, out30, "25bps fork should beat 30bps on equal reserves");
    }

    function test_RevertWhenBelowMinOut() public {
        uint256 amountIn = 1000 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("insufficient output");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 1000 ether, false), legs);
        vm.stopPrank();
    }

    function test_RevertOnSumMismatch() public {
        uint256 amountIn = 1000 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(2);
        legs[0] = _oneHopLeg(600 ether, _v2Hop(address(v2Factory), address(tokenB)));
        legs[1] = _oneHopLeg(300 ether, _v3Hop(address(v3Factory), address(tokenB), 3000));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("sum mismatch");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_DustRefunded() public {
        uint256 amountIn = 500 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        _swap(address(tokenA), address(tokenB), amountIn, 0, false, legs);
        assertEq(tokenA.balanceOf(address(router)), 0);
    }

    function test_RevertWhenFactoryNotWhitelisted() public {
        MockV2Factory rogue = new MockV2Factory();
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(rogue), address(tokenB)));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("factory not registered");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_RevertOnMisshapenSwapData() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v3Factory), address(tokenB)));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert();
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_RevertOnUnknownPool() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v3Hop(address(v3Factory), address(tokenB), 500));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("pool not found");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_RevertOnHopSameToken() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenA)));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("hop same token");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_RevertOnLegEndpointMismatch() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenC)));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("leg endpoint");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_RevertOnEmptyHops() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0].amountIn = amountIn;
        legs[0].hops = new AggRouterJunoswap.Hop[](0);

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("no hops");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_V2ToV2ChainSkipsRouterCustody() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn, _v2Hop(address(v2Factory), address(tokenC)), _v2Hop(address(v2Factory), address(tokenB))
        );

        uint256 mid = _v2Out(pairAC, address(tokenA), amountIn);
        uint256 expected = _v2Out(pairCB, address(tokenC), mid);

        vm.recordLogs();
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(out, expected, "chained output");
        assertEq(_routerTransfersOf(logs, address(tokenC)), 0, "router never moved intermediate");
        assertEq(_routerTransfersOf(logs, address(tokenA)), 1, "router funded first pair once");
        _assertNoCustody();
    }

    function test_V2ToV3ChainRoutesThroughRouter() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn, _v2Hop(address(v2Factory), address(tokenC)), _v3Hop(address(v3Factory), address(tokenB), 3000)
        );

        uint256 mid = _v2Out(pairAC, address(tokenA), amountIn);
        uint256 expected = _v3Out(poolCB, address(tokenC), mid);

        vm.recordLogs();
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(out, expected, "chained output");
        assertEq(_routerTransfersOf(logs, address(tokenC)), 1, "router paid the v3 pool in callback");
        _assertNoCustody();
    }

    function test_V3ToV2ChainSkipsRouterCustody() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn, _v3Hop(address(v3Factory), address(tokenC), 3000), _v2Hop(address(v2Factory), address(tokenB))
        );

        uint256 mid = _v3Out(poolAC, address(tokenA), amountIn);
        uint256 expected = _v2Out(pairCB, address(tokenC), mid);

        vm.recordLogs();
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(out, expected, "chained output");
        assertEq(_routerTransfersOf(logs, address(tokenC)), 0, "v3 pool paid the pair directly");
        _assertNoCustody();
    }

    function test_V3ToV3Chain() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn,
            _v3Hop(address(v3Factory), address(tokenC), 3000),
            _v3Hop(address(v3Factory), address(tokenB), 3000)
        );

        uint256 mid = _v3Out(poolAC, address(tokenA), amountIn);
        uint256 expected = _v3Out(poolCB, address(tokenC), mid);

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);
        assertEq(out, expected, "v3->v3 output");
        _assertNoCustody();
    }

    function test_SplitWithMixedHopDepths() public {
        uint256 amountIn = 1000 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(2);
        legs[0] = _oneHopLeg(600 ether, _v2Hop(address(v2Factory), address(tokenB)));
        legs[1] = _twoHopLeg(
            400 ether, _v2Hop(address(v2Factory), address(tokenC)), _v3Hop(address(v3Factory), address(tokenB), 3000)
        );

        uint256 e0 = _v2Out(pairAB, address(tokenA), 600 ether);
        uint256 mid = _v2Out(pairAC, address(tokenA), 400 ether);
        uint256 e1 = _v3Out(poolCB, address(tokenC), mid);

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, e0 + e1, false, legs);

        assertEq(out, e0 + e1, "summed output across mixed-depth legs");
        assertEq(tokenB.balanceOf(recipient), e0 + e1);
        _assertNoCustody();
    }

    function test_RevertOnV3PartialFill() public {
        poolAB.setFillBps(9000);
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v3Hop(address(v3Factory), address(tokenB), 3000));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("v3 partial fill");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_PancakeCallbackSelector() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v3Hop(address(pcsFactory), address(tokenB), 2500));

        uint256 expected = _v3Out(pcsAB, address(tokenA), amountIn);
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);

        assertEq(out, expected, "pancake pool swapped via its own callback selector");
        _assertNoCustody();
    }

    function test_KublerxCallbackSelector() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v3Hop(address(klxFactory), address(tokenB), 500));

        uint256 expected = _v3Out(klxAB, address(tokenA), amountIn);
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);

        assertEq(out, expected, "kublerx pool swapped via its own callback selector");
        _assertNoCustody();
    }

    function test_UnknownCallbackSelectorStillSettles() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v3Hop(address(unknownFactory), address(tokenB), 500));

        uint256 expected = _v3Out(unknownAB, address(tokenA), amountIn);
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);

        assertEq(out, expected, "pool with an unknown callback name swapped");
        _assertNoCustody();
    }

    function test_CallbackRevertsOutsideAggregate() public {
        bytes memory data = abi.encode(address(v3Factory), address(tokenA), address(tokenB), uint24(3000), 1 ether);

        string[4] memory sigs = [
            "uniswapV3SwapCallback(int256,int256,bytes)",
            "pancakeV3SwapCallback(int256,int256,bytes)",
            "kublerxSwapCallback(int256,int256,bytes)",
            "someFutureV3SwapCallback(int256,int256,bytes)"
        ];

        for (uint256 i = 0; i < sigs.length; i++) {
            vm.prank(address(poolAB));
            (bool ok, bytes memory ret) =
                address(router).call(abi.encodeWithSignature(sigs[i], int256(1 ether), -int256(1 ether), data));
            assertFalse(ok, sigs[i]);
            assertEq(_revertReason(ret), "no active swap", sigs[i]);
        }
    }

    function test_FallbackRejectsGarbageCalldata() public {
        (bool ok,) = address(router).call(hex"deadbeef");
        assertFalse(ok, "empty callback args");

        (ok,) = address(router).call(hex"dead");
        assertFalse(ok, "calldata shorter than a selector");
    }

    function test_CallbackRevertsForNonPoolDuringAggregate() public {
        AttackingV3Pool evil = new AttackingV3Pool(address(tokenA), address(tokenB), 3000);
        MockV3FactorySim f = new MockV3FactorySim();
        f.register(address(evil));
        router.setFactory(address(f), router.KIND_V3(), 0);
        tokenA.mint(address(evil), RESERVE);
        tokenB.mint(address(evil), RESERVE);

        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v3Hop(address(f), address(tokenB), 3000));

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, 0, false, legs);

        assertGt(out, 0, "legitimate swap still settles");
        assertTrue(evil.attackReverted(), "non-pool caller was rejected mid-swap");
        _assertNoCustody();
    }

    function test_RevertOnFeeOnTransferInput() public {
        uint256 amountIn = 100 ether;
        fot.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        vm.startPrank(user);
        fot.approve(address(router), amountIn);
        vm.expectRevert("fee-on-transfer");
        router.aggregate(_params(address(fot), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_FeeOnTransferIntermediateDegradesOnV2() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] =
            _twoHopLeg(amountIn, _v2Hop(address(v2Factory), address(fot)), _v2Hop(address(v2Factory), address(tokenB)));

        uint256 requested = _v2Out(pairAF, address(tokenA), amountIn);
        uint256 idealIfNoFee = _v2Out(pairFB, address(fot), requested);

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, 0, false, legs);

        assertGt(out, 0, "route still settles");
        assertLt(out, idealIfNoFee, "output reduced by the burn, not silently assumed");

        tokenA.mint(user, amountIn);
        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("insufficient output");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, idealIfNoFee, false), legs);
        vm.stopPrank();
    }

    function test_FeeOnTransferIntermediateRevertsOnV3() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn, _v2Hop(address(v2Factory), address(fot)), _v3Hop(address(v3Factory), address(tokenB), 3000)
        );

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert();
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_NoDataPairSwaps() public {
        uint256 amountIn = 10 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2FactoryND), address(tokenB)));

        uint256 expected = _v2OutND(pairABND, address(tokenA), amountIn);
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);

        assertEq(out, expected);
        assertEq(tokenB.balanceOf(recipient), out);
    }

    function test_NoDataFactoryRegisteredAsStandardKindReverts() public {
        router.setFactory(address(v2FactoryND), router.KIND_V2(), 30);

        uint256 amountIn = 10 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2FactoryND), address(tokenB)));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert();
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, 0, false), legs);
        vm.stopPrank();
    }

    function test_NoDataPairChainsToNoDataPair() public {
        uint256 amountIn = 10 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn, _v2Hop(address(v2FactoryND), address(tokenC)), _v2Hop(address(v2FactoryND), address(tokenB))
        );

        uint256 mid = _v2OutND(pairACND, address(tokenA), amountIn);
        uint256 expected = _v2OutND(pairCBND, address(tokenC), mid);

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);

        assertEq(out, expected);
        assertEq(tokenC.balanceOf(address(router)), 0, "router took custody of intermediate");
    }

    function test_SplitAcrossStandardAndNoDataPairs() public {
        uint256 amountIn = 10 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(2);
        legs[0] = _oneHopLeg(6 ether, _v2Hop(address(v2Factory), address(tokenB)));
        legs[1] = _oneHopLeg(4 ether, _v2Hop(address(v2FactoryND), address(tokenB)));

        uint256 expected = _v2Out(pairAB, address(tokenA), 6 ether) + _v2OutND(pairABND, address(tokenA), 4 ether);

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, expected, false, legs);
        assertEq(out, expected);
    }

    function test_SetFactoryNoDataRequiresNonZeroFee() public {
        uint8 kindND = router.KIND_V2_NODATA();

        vm.expectRevert("bad fee");
        router.setFactory(address(v2FactoryND), kindND, 0);
    }

    function test_NativeInputWraps() public {
        uint256 amountIn = 10 ether;
        vm.deal(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        uint256 expected = _v2Out(pairBW, address(weth), amountIn);
        uint256 out = _swap(NATIVE, address(tokenB), amountIn, expected, false, legs);

        assertEq(out, expected);
        assertEq(tokenB.balanceOf(recipient), out);
    }

    function test_DonatedInputTokenIsNotPaidToSwapper() public {
        tokenA.mint(address(router), 5 ether);

        uint256 amountIn = 10 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        _swap(address(tokenA), address(tokenB), amountIn, 0, false, legs);

        assertEq(tokenA.balanceOf(user), 0, "swapper got a windfall");
        assertEq(tokenA.balanceOf(address(router)), 5 ether, "donation moved");
    }

    function test_DonationDoesNotBrickKycGatedNativeInput() public {
        KycWETH9 kkub = new KycWETH9();
        AggRouterJunoswap r2 = new AggRouterJunoswap(address(kkub));
        MockV2Factory f2 = new MockV2Factory();
        r2.setFactory(address(f2), r2.KIND_V2(), 30);

        MockV2Pair pair = new MockV2Pair(address(kkub), address(tokenB), 30);
        f2.register(address(pair));
        kkub.deposit{value: RESERVE}();
        kkub.transfer(address(pair), RESERVE);
        tokenB.mint(address(pair), RESERVE);
        pair.sync();

        kkub.deposit{value: 1}();
        kkub.transfer(address(r2), 1);

        uint256 amountIn = 10 ether;
        vm.deal(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(f2), address(tokenB)));

        vm.prank(user);
        uint256 out = r2.aggregate{value: amountIn}(_params(NATIVE, address(tokenB), amountIn, 0, false), legs);

        assertGt(out, 0, "swap bricked by donation");
        assertEq(tokenB.balanceOf(recipient), out);
        assertEq(kkub.balanceOf(address(r2)), 1, "donation moved");
        assertEq(user.balance, 0, "attempted a dust refund");
    }

    function test_NativeOutputUnwraps() public {
        uint256 amountIn = 15 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(weth)));

        uint256 expected = _v2Out(pairAW, address(tokenA), amountIn);
        uint256 balBefore = recipient.balance;

        uint256 out = _swap(address(tokenA), NATIVE, amountIn, expected, true, legs);

        assertEq(out, expected);
        assertEq(recipient.balance - balBefore, expected, "native delivered");
    }

    function test_NativeOutputKkubStyleDeliversWrapped() public {
        uint256 amountIn = 15 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(weth)));

        uint256 expected = _v2Out(pairAW, address(tokenA), amountIn);
        uint256 out = _swap(address(tokenA), NATIVE, amountIn, expected, false, legs);

        assertEq(out, expected);
        assertEq(weth.balanceOf(recipient), expected, "wrapped delivered, not unwrapped");
    }

    function test_NativeInputCrossDexMultihop() public {
        uint256 amountIn = 10 ether;
        vm.deal(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn, _v2Hop(address(v2Factory), address(tokenA)), _v3Hop(address(v3Factory), address(tokenB), 3000)
        );

        uint256 mid = _v2Out(pairAW, address(weth), amountIn);
        uint256 expected = _v3Out(poolAB, address(tokenA), mid);

        uint256 out = _swap(NATIVE, address(tokenB), amountIn, expected, false, legs);
        assertEq(out, expected);
        assertEq(tokenB.balanceOf(recipient), expected);
    }

    function test_NativeOutputCrossDexMultihopUnwraps() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _twoHopLeg(
            amountIn, _v3Hop(address(v3Factory), address(tokenB), 3000), _v2Hop(address(v2Factory), address(weth))
        );

        uint256 mid = _v3Out(poolAB, address(tokenA), amountIn);
        uint256 expected = _v2Out(pairBW, address(tokenB), mid);
        uint256 balBefore = recipient.balance;

        uint256 out = _swap(address(tokenA), NATIVE, amountIn, expected, true, legs);

        assertEq(out, expected);
        assertEq(recipient.balance - balBefore, expected, "native delivered");
    }

    function test_SetFactoryValidation() public {
        uint8 kindV2 = router.KIND_V2();
        uint8 kindV3 = router.KIND_V3();

        vm.expectRevert("bad factory");
        router.setFactory(address(0), kindV2, 30);

        vm.expectRevert("bad kind");
        router.setFactory(address(0xDEAD), 0, 30);

        vm.expectRevert("bad kind");
        router.setFactory(address(0xDEAD), 4, 30);

        vm.expectRevert("bad fee");
        router.setFactory(address(0xDEAD), kindV2, 0);

        vm.expectRevert("bad fee");
        router.setFactory(address(0xDEAD), kindV2, 10000);

        vm.expectRevert("bad fee");
        router.setFactory(address(0xDEAD), kindV3, 30);

        router.setFactory(address(0xDEAD), kindV3, 0);
        assertEq(router.factoryKind(address(0xDEAD)), kindV3);
    }

    function test_SetFactoryOnlyOwner() public {
        uint8 kindV2 = router.KIND_V2();
        vm.prank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        router.setFactory(address(0xDEAD), kindV2, 30);
    }

    function testFuzz_SumMustEqualAmountIn(uint256 a, uint256 b, uint256 declared) public {
        a = bound(a, 1 ether, 1000 ether);
        b = bound(b, 1 ether, 1000 ether);
        declared = bound(declared, 1 ether, 3000 ether);
        uint256 total = a + b;
        tokenA.mint(user, total);

        AggRouterJunoswap.Leg[] memory legs = _legs(2);
        legs[0] = _oneHopLeg(a, _v2Hop(address(v2Factory), address(tokenB)));
        legs[1] = _oneHopLeg(b, _v3Hop(address(v3Factory), address(tokenB), 3000));

        vm.startPrank(user);
        tokenA.approve(address(router), total);
        if (declared != total) {
            vm.expectRevert();
            router.aggregate(_params(address(tokenA), address(tokenB), declared, 0, false), legs);
        } else {
            router.aggregate(_params(address(tokenA), address(tokenB), declared, 0, false), legs);
            assertEq(tokenA.balanceOf(user), 0);
        }
        vm.stopPrank();
    }

    function testFuzz_NeverRetainsCustody(uint256 split) public {
        uint256 total = 1000 ether;
        split = bound(split, 1 ether, total - 1 ether);
        tokenA.mint(user, total);

        AggRouterJunoswap.Leg[] memory legs = _legs(2);
        legs[0] = _oneHopLeg(split, _v2Hop(address(v2Factory), address(tokenB)));
        legs[1] = _twoHopLeg(
            total - split,
            _v3Hop(address(v3Factory), address(tokenC), 3000),
            _v2Hop(address(v2Factory), address(tokenB))
        );

        _swap(address(tokenA), address(tokenB), total, 0, false, legs);
        _assertNoCustody();
    }

    function test_FeeSkimmedFromOutput() public {
        router.setFee(collector, 30);

        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        uint256 gross = _v2Out(pairAB, address(tokenA), amountIn);
        uint256 fee = (gross * 30) / 10000;

        vm.recordLogs();
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, 0, false, legs);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(out, gross - fee, "returns net of fee");
        assertEq(tokenB.balanceOf(collector), fee, "collector paid");
        assertEq(tokenB.balanceOf(recipient), gross - fee, "recipient netted");
        assertEq(_routerTransfersOf(logs, address(tokenB)), 2, "fee transfer + recipient transfer");
        _assertNoCustody();
    }

    function test_MinAmountOutBindsNetOfFee() public {
        router.setFee(collector, 30);

        uint256 amountIn = 100 ether;
        tokenA.mint(user, 2 * amountIn);
        uint256 gross = _v2Out(pairAB, address(tokenA), amountIn);
        uint256 net = gross - (gross * 30) / 10000;

        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        vm.startPrank(user);
        tokenA.approve(address(router), amountIn);
        vm.expectRevert("insufficient output");
        router.aggregate(_params(address(tokenA), address(tokenB), amountIn, gross, false), legs);
        vm.stopPrank();

        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, net, false, legs);
        assertEq(out, net, "net is the tight bound");
    }

    function test_ZeroFeeSkipsTransfer() public {
        uint256 amountIn = 100 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(tokenB)));

        uint256 gross = _v2Out(pairAB, address(tokenA), amountIn);

        vm.recordLogs();
        uint256 out = _swap(address(tokenA), address(tokenB), amountIn, gross, false, legs);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(out, gross, "unfeed output untouched");
        assertEq(tokenB.balanceOf(collector), 0, "nothing skimmed");
        assertEq(_routerTransfersOf(logs, address(tokenB)), 1, "recipient transfer only");
    }

    function test_FeeOnNativeOutput() public {
        router.setFee(collector, 30);

        uint256 amountIn = 15 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(weth)));

        uint256 gross = _v2Out(pairAW, address(tokenA), amountIn);
        uint256 fee = (gross * 30) / 10000;
        uint256 balBefore = recipient.balance;

        uint256 out = _swap(address(tokenA), NATIVE, amountIn, 0, true, legs);

        assertEq(out, gross - fee);
        assertEq(recipient.balance - balBefore, gross - fee, "recipient unwrapped, net");
        assertEq(weth.balanceOf(collector), fee, "collector holds wrapped, not native");
        assertEq(collector.balance, 0, "collector never receives native");
    }

    function test_FeeOnWrappedNativeOutput() public {
        router.setFee(collector, 30);

        uint256 amountIn = 15 ether;
        tokenA.mint(user, amountIn);
        AggRouterJunoswap.Leg[] memory legs = _legs(1);
        legs[0] = _oneHopLeg(amountIn, _v2Hop(address(v2Factory), address(weth)));

        uint256 gross = _v2Out(pairAW, address(tokenA), amountIn);
        uint256 fee = (gross * 30) / 10000;

        uint256 out = _swap(address(tokenA), NATIVE, amountIn, 0, false, legs);

        assertEq(out, gross - fee);
        assertEq(weth.balanceOf(recipient), gross - fee, "kkub-style delivery, net");
        assertEq(weth.balanceOf(collector), fee);
    }

    function test_FeeAcrossSplitLegs() public {
        router.setFee(collector, 30);

        uint256 half = 50 ether;
        tokenA.mint(user, 2 * half);

        AggRouterJunoswap.Leg[] memory legs = _legs(2);
        legs[0] = _oneHopLeg(half, _v2Hop(address(v2Factory), address(tokenB)));
        legs[1] = _oneHopLeg(half, _v2Hop(address(v2FactoryLow), address(tokenB)));

        uint256 gross = _v2Out(pairAB, address(tokenA), half) + _v2Out(pairABLow, address(tokenA), half);
        uint256 fee = (gross * 30) / 10000;

        uint256 out = _swap(address(tokenA), address(tokenB), 2 * half, 0, false, legs);

        assertEq(out, gross - fee, "fee taken once on the sum");
        assertEq(tokenB.balanceOf(collector), fee);
        _assertNoCustody();
    }

    function test_SetFeeOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        router.setFee(collector, 30);
    }

    function test_SetFeeRejectsAboveCap() public {
        uint16 max = router.MAX_FEE_BPS();

        vm.expectRevert("fee too high");
        router.setFee(collector, max + 1);

        router.setFee(collector, max);
        assertEq(router.feeBps(), max, "cap itself is allowed");
    }

    function test_SetFeeRejectsZeroCollector() public {
        vm.expectRevert("bad collector");
        router.setFee(address(0), 1);

        router.setFee(address(0), 0);
        assertEq(router.feeCollector(), address(0));
        assertEq(router.feeBps(), 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/FeeCollector.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/ERC20Token.sol";
import "./mocks/MockV3Factory.sol";
import "./mocks/MockV3Pool.sol";
import "./mocks/MockPositionManager.sol";

contract FeeCollectorTest is Test {
    event FeeShared(
        address indexed tokenAddr,
        address indexed creator,
        uint256 creatorAmount,
        uint256 treasuryAmount,
        bool isNative
    );
    event Claimed(address indexed account, address indexed tokenAddr, uint256 amount);
    event CreatorShareSet(uint256 bps);
    event TreasurySet(address treasury);

    FeeCollector public collector;
    ERC20Token public token;

    address public curve;
    address public treasury;
    address public creator;
    address public stranger;

    uint256 constant CREATOR_SHARE_BPS = 5000;

    function setUp() public {
        curve = makeAddr("curve");
        treasury = makeAddr("treasury");
        creator = makeAddr("creator");
        stranger = makeAddr("stranger");

        collector = new FeeCollector(treasury, CREATOR_SHARE_BPS, curve);
        token = new ERC20Token("Fee", "FEE", 1_000_000 ether);
        vm.deal(curve, 100 ether);
    }

    function _collectNative(uint256 amount) internal {
        vm.prank(curve);
        collector.collectNative{value: amount}(address(token), creator);
    }

    function _collectToken(uint256 amount) internal {
        token.transfer(address(collector), amount);
        vm.prank(curve);
        collector.collectToken(address(token), creator, amount);
    }

    function test_Constructor_SetsState() public {
        assertEq(collector.curve(), curve);
        assertEq(collector.treasury(), treasury);
        assertEq(collector.creatorShareBps(), CREATOR_SHARE_BPS);
        assertEq(collector.owner(), address(this));
    }

    function test_RevertConstructor_BadArgs() public {
        vm.expectRevert("invalid treasury");
        new FeeCollector(address(0), CREATOR_SHARE_BPS, curve);

        vm.expectRevert("invalid curve");
        new FeeCollector(treasury, CREATOR_SHARE_BPS, address(0));

        vm.expectRevert("share too high");
        new FeeCollector(treasury, 10001, curve);
    }

    function test_RevertCollect_NonCurve() public {
        vm.deal(stranger, 1 ether);

        vm.prank(stranger);
        vm.expectRevert("only curve");
        collector.collectNative{value: 1 ether}(address(token), creator);

        vm.prank(stranger);
        vm.expectRevert("only curve");
        collector.collectToken(address(token), creator, 1 ether);

        vm.prank(stranger);
        (bool ok, bytes memory err) = address(collector).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(err, abi.encodeWithSignature("Error(string)", "only curve"));
    }

    function test_CollectNative_SplitsAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit FeeShared(address(token), creator, 0.5 ether, 0.5 ether, true);
        _collectNative(1 ether);

        assertEq(collector.claimable(creator, address(0)), 0.5 ether);
        assertEq(collector.claimable(treasury, address(0)), 0.5 ether);
        assertEq(address(collector).balance, 1 ether);
    }

    function test_CollectToken_SplitsAndEmits() public {
        token.transfer(address(collector), 200 ether);

        vm.expectEmit(true, true, true, true);
        emit FeeShared(address(token), creator, 100 ether, 100 ether, false);
        vm.prank(curve);
        collector.collectToken(address(token), creator, 200 ether);

        assertEq(collector.claimable(creator, address(token)), 100 ether);
        assertEq(collector.claimable(treasury, address(token)), 100 ether);
    }

    function test_CollectNative_Accumulates() public {
        _collectNative(1 ether);
        _collectNative(3 ether);
        assertEq(collector.claimable(creator, address(0)), 2 ether);
        assertEq(collector.claimable(treasury, address(0)), 2 ether);
    }

    function test_Collect_UnknownCreator_AllToTreasury() public {
        vm.prank(curve);
        collector.collectNative{value: 1 ether}(address(token), address(0));
        assertEq(collector.claimable(treasury, address(0)), 1 ether);

        token.transfer(address(collector), 10 ether);
        vm.prank(curve);
        collector.collectToken(address(token), address(0), 10 ether);
        assertEq(collector.claimable(treasury, address(token)), 10 ether);
    }

    function test_Receive_CreditsTreasury() public {
        vm.prank(curve);
        (bool ok, ) = address(collector).call{value: 2 ether}("");

        assertTrue(ok);
        assertEq(collector.claimable(treasury, address(0)), 2 ether);
        assertEq(collector.claimable(creator, address(0)), 0);
    }

    function test_Claim_PaysAndZeroes() public {
        _collectNative(1 ether);

        vm.expectEmit(true, true, true, true);
        emit Claimed(creator, address(0), 0.5 ether);
        vm.prank(creator);
        uint256 claimed = collector.claim(address(0));

        assertEq(claimed, 0.5 ether);
        assertEq(creator.balance, 0.5 ether);
        assertEq(collector.claimable(creator, address(0)), 0);
        assertEq(address(collector).balance, 0.5 ether, "the treasury's half stays put");
    }

    function test_ClaimToken_PaysAndZeroes() public {
        _collectToken(200 ether);

        vm.prank(creator);
        uint256 claimed = collector.claim(address(token));

        assertEq(claimed, 100 ether);
        assertEq(token.balanceOf(creator), 100 ether);
        assertEq(collector.claimable(creator, address(token)), 0);
    }

    function test_RevertClaim_Twice() public {
        _collectNative(1 ether);
        vm.startPrank(creator);
        collector.claim(address(0));
        vm.expectRevert("nothing to claim");
        collector.claim(address(0));
        vm.stopPrank();
    }

    function test_RevertClaim_NothingOwed() public {
        vm.prank(stranger);
        vm.expectRevert("nothing to claim");
        collector.claim(address(token));
    }

    function test_RejectingCreator_DoesNotBlockTreasury() public {
        RejectingCreator badCreator = new RejectingCreator();
        vm.prank(curve);
        collector.collectNative{value: 1 ether}(address(token), address(badCreator));

        vm.expectRevert("native transfer failed");
        badCreator.claimOn(collector);

        vm.prank(treasury);
        assertEq(collector.claim(address(0)), 0.5 ether);
        assertEq(treasury.balance, 0.5 ether);
        assertEq(collector.claimable(address(badCreator), address(0)), 0.5 ether, "still owed, not lost");
    }

    function test_SetCreatorShareBps_Bounds() public {
        vm.expectEmit(true, true, true, true);
        emit CreatorShareSet(0);
        collector.setCreatorShareBps(0);
        _collectNative(1 ether);
        assertEq(collector.claimable(creator, address(0)), 0);
        assertEq(collector.claimable(treasury, address(0)), 1 ether);

        collector.setCreatorShareBps(10000);
        _collectNative(1 ether);
        assertEq(collector.claimable(creator, address(0)), 1 ether);
        assertEq(collector.claimable(treasury, address(0)), 1 ether, "unchanged by the second fee");
    }

    function test_RevertSetCreatorShareBps_AboveCap() public {
        vm.expectRevert("share too high");
        collector.setCreatorShareBps(10001);
    }

    function test_RevertAdmin_NonOwner() public {
        vm.startPrank(stranger);
        vm.expectRevert("Ownable: caller is not the owner");
        collector.setCreatorShareBps(0);
        vm.expectRevert("Ownable: caller is not the owner");
        collector.setTreasury(stranger);
        vm.expectRevert("Ownable: caller is not the owner");
        collector.setCurveFee(0, 0);
        vm.stopPrank();
    }

    function test_SetTreasury_LeavesCreditedBalances() public {
        _collectNative(1 ether);
        address newTreasury = makeAddr("newTreasury");

        vm.expectEmit(true, true, true, true);
        emit TreasurySet(newTreasury);
        collector.setTreasury(newTreasury);
        _collectNative(1 ether);

        assertEq(collector.claimable(treasury, address(0)), 0.5 ether, "old treasury keeps what it earned");
        assertEq(collector.claimable(newTreasury, address(0)), 0.5 ether);

        vm.prank(treasury);
        assertEq(collector.claim(address(0)), 0.5 ether);
    }

    function testFuzz_Split_ConservesAmount(uint256 amount, uint256 bps) public {
        amount = bound(amount, 0, 1e30);
        bps = bound(bps, 0, 10000);
        collector.setCreatorShareBps(bps);

        vm.deal(curve, amount);
        vm.prank(curve);
        collector.collectNative{value: amount}(address(token), creator);

        assertEq(collector.claimable(creator, address(0)) + collector.claimable(treasury, address(0)), amount);
    }
}

contract FeeCollectorCurveTest is Test {
    JunoBondingCurveV1_1 public pump;
    FeeCollector public collector;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;

    address public treasury;
    address public alice;
    address public bob;
    address public wrappedNative;

    uint256 constant CREATE_FEE = 0.001 ether;
    uint256 constant VIRTUAL_AMOUNT = 0.5 ether;
    uint256 constant GRADUATION_AMOUNT = 0.2 ether;
    uint256 constant PUMP_FEE = 100;
    uint256 constant CREATOR_SHARE_BPS = 5000;

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();
        factory.setMockPool(address(pool));

        treasury = makeAddr("treasury");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        wrappedNative = address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
        posManager.setWrappedNative(wrappedNative);
        posManager.setPoolFactory(address(factory));

        address predictedCurve = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        collector = new FeeCollector(treasury, CREATOR_SHARE_BPS, predictedCurve);
        pump = new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), address(collector), VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );
        collector.setCurveFee(CREATE_FEE, PUMP_FEE);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _createToken() internal returns (address) {
        vm.prank(alice);
        return pump.createToken{value: CREATE_FEE}("TestToken", "TT", "logo", "desc", "l1", "l2", "l3");
    }

    function test_CreateFee_GoesWhollyToTreasury() public {
        _createToken();
        assertEq(collector.claimable(treasury, address(0)), CREATE_FEE);
        assertEq(collector.claimable(alice, address(0)), 0);
    }

    function test_BuyFee_SplitsToCreator() public {
        address tokenAddr = _createToken();

        vm.prank(bob);
        pump.buy{value: 0.05 ether}(tokenAddr, 0);

        uint256 fee = (0.05 ether * PUMP_FEE) / 10000;
        uint256 creatorCut = (fee * CREATOR_SHARE_BPS) / 10000;
        assertEq(collector.claimable(alice, address(0)), creatorCut);
        assertEq(collector.claimable(treasury, address(0)), CREATE_FEE + fee - creatorCut);
    }

    function test_SellFee_SplitsToCreatorInToken() public {
        address tokenAddr = _createToken();
        vm.startPrank(bob);
        uint256 bought = pump.buy{value: 0.05 ether}(tokenAddr, 0);
        ERC20Token(tokenAddr).approve(address(pump), bought);
        pump.sell(tokenAddr, bought, 0);
        vm.stopPrank();

        uint256 fee = (bought * PUMP_FEE) / 10000;
        uint256 creatorCut = (fee * CREATOR_SHARE_BPS) / 10000;
        assertEq(collector.claimable(alice, tokenAddr), creatorCut);
        assertEq(collector.claimable(treasury, tokenAddr), fee - creatorCut);
        assertEq(ERC20Token(tokenAddr).balanceOf(address(collector)), fee);
    }

    function test_CreatorClaimsBothSides() public {
        address tokenAddr = _createToken();
        vm.startPrank(bob);
        uint256 bought = pump.buy{value: 1 ether}(tokenAddr, 0);
        ERC20Token(tokenAddr).approve(address(pump), bought);
        pump.sell(tokenAddr, bought, 0);
        vm.stopPrank();

        uint256 owedNative = collector.claimable(alice, address(0));
        uint256 owedToken = collector.claimable(alice, tokenAddr);
        assertGt(owedNative, 0);
        assertGt(owedToken, 0);

        uint256 balanceBefore = alice.balance;
        vm.startPrank(alice);
        collector.claim(address(0));
        collector.claim(tokenAddr);
        vm.stopPrank();

        assertEq(alice.balance - balanceBefore, owedNative);
        assertEq(ERC20Token(tokenAddr).balanceOf(alice), owedToken);
    }

    function test_GraduationDust_GoesWhollyToTreasury() public {
        address tokenAddr = _createToken();
        vm.prank(bob);
        pump.buy{value: 1 ether}(tokenAddr, 0);

        (uint256 nativeReserve,) = pump.pumpReserve(tokenAddr);
        uint256 usedNative = nativeReserve / 2;
        posManager.setPartialFill(usedNative, ERC20Token(tokenAddr).balanceOf(address(pump)) / 2);

        uint256 treasuryBefore = collector.claimable(treasury, address(0));
        uint256 creatorBefore = collector.claimable(alice, address(0));
        pump.graduate(tokenAddr);

        assertEq(collector.claimable(treasury, address(0)) - treasuryBefore, nativeReserve - usedNative);
        assertEq(collector.claimable(alice, address(0)), creatorBefore);
    }

    function test_CurveAdminPassthrough() public {
        collector.setCurveFee(0.5 ether, 200);
        assertEq(pump.createFee(), 0.5 ether);
        assertEq(pump.pumpFee(), 200);

        vm.prank(treasury);
        vm.expectRevert();
        pump.setFee(0, 0);
    }
}

contract RejectingCreator {
    receive() external payable {
        revert("nope");
    }

    function claimOn(FeeCollector collector) external returns (uint256) {
        return collector.claim(address(0));
    }
}

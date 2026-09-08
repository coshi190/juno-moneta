// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/LpFeeLocker.sol";
import "../src/FeeCollector.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/ERC20Token.sol";
import "./mocks/MockV3Factory.sol";
import "./mocks/MockV3Pool.sol";
import "./mocks/MockPositionManager.sol";
import {MockWETH9} from "./mocks/MockPools.sol";

contract LpFeeLockerTest is Test {
    event LpFeesCollected(
        uint256 indexed tokenId,
        address indexed tokenAddr,
        address indexed creator,
        uint256 amount0,
        uint256 amount1
    );
    event LpFeeShared(
        address indexed tokenAddr,
        address indexed creator,
        address indexed asset,
        uint256 creatorAmount,
        uint256 treasuryAmount
    );

    JunoBondingCurveV1_1 public pump;
    FeeCollector public collector;
    LpFeeLocker public locker;
    MockV3Factory public factory;
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
        posManager = new MockPositionManager();

        treasury = makeAddr("treasury");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        wrappedNative = address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
        vm.etch(wrappedNative, address(new MockWETH9()).code);
        posManager.setWrappedNative(wrappedNative);
        posManager.setPoolFactory(address(factory));

        uint256 nonce = vm.getNonce(address(this));
        address predictedLocker = vm.computeCreateAddress(address(this), nonce + 1);
        address predictedCurve = vm.computeCreateAddress(address(this), nonce + 2);
        collector = new FeeCollector(treasury, CREATOR_SHARE_BPS, predictedCurve, predictedLocker);
        locker = new LpFeeLocker(address(collector), address(posManager), wrappedNative);
        pump = new JunoBondingCurveV1_1(
            wrappedNative,
            address(factory),
            address(posManager),
            address(collector),
            address(locker),
            VIRTUAL_AMOUNT,
            GRADUATION_AMOUNT
        );
        require(address(pump) == predictedCurve, "curve address mismatch");
        collector.setCurveFee(CREATE_FEE, PUMP_FEE);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _graduatedToken() internal returns (address tokenAddr) {
        vm.prank(alice);
        tokenAddr = pump.createToken{value: CREATE_FEE}("TestToken", "TT", "logo", "desc", "l1", "l2", "l3");
        vm.prank(bob);
        pump.buy{value: 1 ether}(tokenAddr, 0);
        pump.graduate(tokenAddr);
    }

    function _accrue(address tokenAddr, uint256 tokenId, uint256 nativeFees, uint256 tokenFees) internal {
        (address tkn0,) = tokenAddr < wrappedNative ? (tokenAddr, wrappedNative) : (wrappedNative, tokenAddr);
        bool tokenIsZero = tkn0 == tokenAddr;
        posManager.setPendingFees(
            tokenId,
            uint128(tokenIsZero ? tokenFees : nativeFees),
            uint128(tokenIsZero ? nativeFees : tokenFees)
        );
    }

    function test_Constructor_DerivesCurveFromCollector() public view {
        assertEq(locker.curve(), address(pump));
        assertEq(locker.feeCollector(), address(collector));
        assertEq(address(locker.posManager()), address(posManager));
        assertEq(locker.wrappedNative(), wrappedNative);
    }

    function test_RevertConstructor_BadArgs() public {
        vm.expectRevert("invalid fee collector");
        new LpFeeLocker(makeAddr("eoaCollector"), address(posManager), wrappedNative);

        vm.expectRevert("invalid pos manager");
        new LpFeeLocker(address(collector), address(0), wrappedNative);

        vm.expectRevert("invalid wrapped native");
        new LpFeeLocker(address(collector), address(posManager), address(0));

        vm.expectRevert("wrapped native mismatch");
        new LpFeeLocker(address(collector), address(posManager), makeAddr("otherWrappedNative"));
    }

    function test_Graduate_MintsPositionToLocker() public {
        address tokenAddr = _graduatedToken();

        assertEq(posManager.ownerOf(1), address(locker), "the locker owns the position");
        assertEq(posManager.balanceOf(address(locker)), 1);
        assertEq(posManager.balanceOf(address(0xdead)), 0, "nothing is burned to 0xdead any more");
        assertEq(pump.lpLocker(), address(locker));
        assertTrue(pump.isGraduate(tokenAddr));
    }

    function test_Collect_AcceptsTheIdFromTheGraduationEvent() public {
        vm.prank(alice);
        address tokenAddr =
            pump.createToken{value: CREATE_FEE}("TestToken", "TT", "logo", "desc", "l1", "l2", "l3");
        vm.prank(bob);
        pump.buy{value: 1 ether}(tokenAddr, 0);

        vm.recordLogs();
        pump.graduate(tokenAddr);

        uint256 tokenId;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("Graduation(address,address,uint256,uint128,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) {
                (, tokenId,,,) = abi.decode(logs[i].data, (address, uint256, uint128, uint256, uint256));
                break;
            }
        }
        assertGt(tokenId, 0, "graduation published an id");
        assertEq(posManager.ownerOf(tokenId), address(locker));

        _accrue(tokenAddr, tokenId, 0.02 ether, 300 ether);
        locker.collect(tokenId);

        assertEq(collector.claimable(alice, tokenAddr), (300 ether * CREATOR_SHARE_BPS) / 10000);
    }

    function test_RevertConstructor_CollectorNamesADifferentLocker() public {
        FeeCollector wrong =
            new FeeCollector(treasury, CREATOR_SHARE_BPS, address(pump), makeAddr("otherLocker"));
        vm.expectRevert("collector locker mismatch");
        new LpFeeLocker(address(wrong), address(posManager), wrappedNative);
    }

    function test_Collect_SplitsBothLegsBetweenCreatorAndTreasury() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);

        locker.collect(1);

        uint256 nativeCreatorCut = (0.02 ether * CREATOR_SHARE_BPS) / 10000;
        uint256 tokenCreatorCut = (300 ether * CREATOR_SHARE_BPS) / 10000;
        assertEq(collector.claimable(alice, wrappedNative), nativeCreatorCut);
        assertEq(collector.claimable(treasury, wrappedNative), 0.02 ether - nativeCreatorCut);
        assertEq(collector.claimable(alice, tokenAddr), tokenCreatorCut);
        assertEq(collector.claimable(treasury, tokenAddr), 300 ether - tokenCreatorCut);

        assertEq(ERC20(wrappedNative).balanceOf(address(collector)), 0.02 ether);
        assertEq(ERC20(tokenAddr).balanceOf(address(collector)), 300 ether);
        assertEq(ERC20(wrappedNative).balanceOf(address(locker)), 0, "the locker keeps nothing");
        assertEq(ERC20(tokenAddr).balanceOf(address(locker)), 0, "the locker keeps nothing");
    }

    function test_Collect_CreatorAndTreasuryCanClaim() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);
        locker.collect(1);

        uint256 owedNative = collector.claimable(alice, wrappedNative);
        uint256 owedToken = collector.claimable(alice, tokenAddr);

        vm.startPrank(alice);
        collector.claim(wrappedNative);
        collector.claim(tokenAddr);
        vm.stopPrank();

        assertEq(ERC20(wrappedNative).balanceOf(alice), owedNative);
        assertEq(ERC20(tokenAddr).balanceOf(alice), owedToken);

        vm.prank(treasury);
        collector.claim(wrappedNative);
        assertEq(ERC20(wrappedNative).balanceOf(treasury), 0.02 ether - owedNative);
    }

    function test_Collect_IsPermissionlessAndPaysNothingToTheCaller() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);

        address poker = makeAddr("poker");
        vm.prank(poker);
        (uint256 amount0, uint256 amount1) = locker.collect(1);

        assertGt(amount0 + amount1, 0);
        assertEq(ERC20(wrappedNative).balanceOf(poker), 0);
        assertEq(ERC20(tokenAddr).balanceOf(poker), 0);
        assertEq(collector.claimable(poker, wrappedNative), 0);
        assertEq(collector.claimable(poker, tokenAddr), 0);
    }

    function test_Collect_EmitsCollectedAndShared() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);
        (uint256 amount0, uint256 amount1) = tokenAddr < wrappedNative
            ? (uint256(300 ether), uint256(0.02 ether))
            : (uint256(0.02 ether), uint256(300 ether));

        vm.expectEmit(true, true, true, true);
        emit LpFeesCollected(1, tokenAddr, alice, amount0, amount1);
        vm.expectEmit(true, true, true, true);
        emit LpFeeShared(
            tokenAddr,
            alice,
            tokenAddr < wrappedNative ? tokenAddr : wrappedNative,
            (amount0 * CREATOR_SHARE_BPS) / 10000,
            amount0 - (amount0 * CREATOR_SHARE_BPS) / 10000
        );
        locker.collect(1);
    }

    function test_Collect_ZeroFees_IsANoOp() public {
        address tokenAddr = _graduatedToken();

        (uint256 amount0, uint256 amount1) = locker.collect(1);

        assertEq(amount0, 0);
        assertEq(amount1, 0);
        assertEq(collector.claimable(alice, tokenAddr), 0);
        assertEq(collector.claimable(treasury, wrappedNative), 0);
    }

    function test_Collect_OneSidedFees() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 0);

        locker.collect(1);

        assertEq(
            collector.claimable(alice, wrappedNative) + collector.claimable(treasury, wrappedNative), 0.02 ether
        );
        assertEq(collector.claimable(alice, tokenAddr), 0);
        assertEq(collector.claimable(treasury, tokenAddr), 0);
    }

    function test_Collect_Twice_TakesOnlyWhatAccrued() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);
        locker.collect(1);

        (uint256 amount0, uint256 amount1) = locker.collect(1);
        assertEq(amount0, 0);
        assertEq(amount1, 0);
        assertEq(
            collector.claimable(alice, wrappedNative) + collector.claimable(treasury, wrappedNative), 0.02 ether
        );
    }

    function test_Collect_LeavesTheLiquidityAndOwnershipUntouched() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);
        (,,,,,,, uint128 liquidityBefore,,,,) = posManager.positions(1);

        locker.collect(1);

        (,,,,,,, uint128 liquidityAfter,,,,) = posManager.positions(1);
        assertEq(liquidityAfter, liquidityBefore, "collect must never touch the principal");
        assertEq(posManager.ownerOf(1), address(locker), "the position never leaves the locker");
        assertTrue(tokenAddr != address(0));
    }

    function test_RevertCollect_PositionNotOwnedByTheLocker() public {
        _graduatedToken();

        vm.expectRevert("Not approved");
        locker.collect(999);
    }

    function test_Collect_UnknownCreator_AllToTreasury() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 0);

        vm.mockCall(
            address(pump),
            abi.encodeWithSelector(pump.creatorOf.selector, tokenAddr),
            abi.encode(address(0))
        );
        locker.collect(1);

        assertEq(collector.claimable(treasury, wrappedNative), 0.02 ether);
        assertEq(collector.claimable(alice, wrappedNative), 0);
    }

}

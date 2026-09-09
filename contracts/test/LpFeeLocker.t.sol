// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/LpFeeLocker.sol";
import "../src/FeeCollector.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/ERC20Token.sol";
import "./mocks/MockV3Factory.sol";
import "./mocks/MockPositionManager.sol";
import {MockWETH9} from "./mocks/MockPools.sol";

contract LpFeeLockerTest is Test {
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
    uint256 constant BPS_DENOMINATOR = 10000;

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
        locker = new LpFeeLocker(address(collector), address(posManager));
        pump = new JunoBondingCurveV1_1(
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

    function _sorted(address tokenAddr, uint256 nativeAmount, uint256 tokenAmount)
        internal
        view
        returns (uint256 amount0, uint256 amount1)
    {
        return tokenAddr < wrappedNative ? (tokenAmount, nativeAmount) : (nativeAmount, tokenAmount);
    }

    function _accrue(address tokenAddr, uint256 tokenId, uint256 nativeFees, uint256 tokenFees) internal {
        (uint256 fees0, uint256 fees1) = _sorted(tokenAddr, nativeFees, tokenFees);
        posManager.setPendingFees(tokenId, uint128(fees0), uint128(fees1));
    }

    function _assertLedger(address tokenAddr, uint256 nativeTotal, uint256 tokenTotal) internal view {
        uint256 nativeCreatorCut = (nativeTotal * CREATOR_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 tokenCreatorCut = (tokenTotal * CREATOR_SHARE_BPS) / BPS_DENOMINATOR;
        assertEq(collector.claimable(alice, wrappedNative), nativeCreatorCut, "alice native cut");
        assertEq(collector.claimable(treasury, wrappedNative), nativeTotal - nativeCreatorCut, "treasury native cut");
        assertEq(collector.claimable(alice, tokenAddr), tokenCreatorCut, "alice token cut");
        assertEq(collector.claimable(treasury, tokenAddr), tokenTotal - tokenCreatorCut, "treasury token cut");
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
        vm.recordLogs();
        address tokenAddr = _graduatedToken();

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

        assertEq(collector.claimable(alice, tokenAddr), (300 ether * CREATOR_SHARE_BPS) / BPS_DENOMINATOR);
    }

    function test_Collect_SplitsBothLegsBetweenCreatorAndTreasury() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);

        locker.collect(1);

        _assertLedger(tokenAddr, 0.02 ether, 300 ether);

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

    function test_Collect_IsPermissionless() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);

        address poker = makeAddr("poker");
        vm.prank(poker);
        locker.collect(1);

        assertEq(collector.claimable(poker, wrappedNative), 0, "the caller is paid nothing");
        assertEq(collector.claimable(poker, tokenAddr), 0, "the caller is paid nothing");
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

    // collect() is permissionless, so repeat calls must credit each round of fees exactly once -
    // inflating the ledger would let a claim drain balances owed to other tokens' creators.
    function test_Collect_Twice_CreditsEachRoundOnce() public {
        address tokenAddr = _graduatedToken();
        _accrue(tokenAddr, 1, 0.02 ether, 300 ether);
        locker.collect(1);

        _accrue(tokenAddr, 1, 0.005 ether, 50 ether);
        (uint256 amount0, uint256 amount1) = locker.collect(1);

        (uint256 second0, uint256 second1) = _sorted(tokenAddr, 0.005 ether, 50 ether);
        assertEq(amount0, second0, "the second collect takes only what accrued since the first");
        assertEq(amount1, second1, "the second collect takes only what accrued since the first");
        _assertLedger(tokenAddr, 0.02 ether + 0.005 ether, 300 ether + 50 ether);

        (amount0, amount1) = locker.collect(1);
        assertEq(amount0, 0, "a collect with nothing newly accrued takes nothing");
        assertEq(amount1, 0, "a collect with nothing newly accrued takes nothing");
        _assertLedger(tokenAddr, 0.02 ether + 0.005 ether, 300 ether + 50 ether);
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

// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/FeeCollector.sol";
import "../src/ERC20Token.sol";

contract RejectingCreator {
    receive() external payable {
        revert("nope");
    }

    function claimOn(FeeCollector collector) external returns (uint256) {
        return collector.claim(address(0));
    }
}

contract FeeCollectorTest is Test {
    FeeCollector public collector;
    ERC20Token public token;

    address public curve;
    address public treasury;
    address public creator;

    uint256 constant CREATOR_SHARE_BPS = 5000;

    function setUp() public {
        curve = makeAddr("curve");
        treasury = makeAddr("treasury");
        creator = makeAddr("creator");

        address lpLocker = makeAddr("lpLocker");
        collector = new FeeCollector(treasury, CREATOR_SHARE_BPS, curve, lpLocker);
        token = new ERC20Token("Fee", "FEE", 1_000_000 ether);
        vm.deal(curve, 100 ether);
    }

    function _collectNativeFor(address _creator, uint256 amount) internal {
        vm.prank(curve);
        collector.collectNative{value: amount}(address(token), _creator);
    }

    function _collectTokenFor(address _creator, uint256 amount) internal {
        token.transfer(curve, amount);
        vm.startPrank(curve);
        token.approve(address(collector), amount);
        collector.collectToken(address(token), _creator, amount);
        vm.stopPrank();
    }

    function test_CollectNative_Accumulates() public {
        // A 25/75 split so the creator's row can't be mistaken for the treasury's.
        collector.setCreatorShareBps(2500);

        _collectNativeFor(creator, 2 ether);
        _collectNativeFor(creator, 2 ether + 3 wei);

        assertEq(collector.claimable(creator, address(0)), 1 ether);
        assertEq(collector.claimable(treasury, address(0)), 3 ether + 3 wei, "the odd wei lands on the treasury");
        assertEq(
            address(collector).balance,
            collector.claimable(creator, address(0)) + collector.claimable(treasury, address(0)),
            "the collector holds exactly what its ledger owes"
        );
    }

    function test_Collect_UnknownCreator_AllToTreasury() public {
        _collectNativeFor(address(0), 1 ether);
        assertEq(collector.claimable(treasury, address(0)), 1 ether);

        _collectTokenFor(address(0), 10 ether);
        assertEq(collector.claimable(treasury, address(token)), 10 ether);
    }

    function test_RevertClaim_Twice() public {
        _collectNativeFor(creator, 1 ether);
        vm.startPrank(creator);
        collector.claim(address(0));
        vm.expectRevert("nothing to claim");
        collector.claim(address(0));
        vm.stopPrank();
    }

    function test_RejectingCreator_DoesNotBlockTreasury() public {
        RejectingCreator badCreator = new RejectingCreator();
        _collectNativeFor(address(badCreator), 1 ether);

        vm.expectRevert("native transfer failed");
        badCreator.claimOn(collector);

        vm.prank(treasury);
        assertEq(collector.claim(address(0)), 0.5 ether);
        assertEq(treasury.balance, 0.5 ether);
        assertEq(collector.claimable(address(badCreator), address(0)), 0.5 ether, "still owed, not lost");
        assertEq(address(collector).balance, 0.5 ether, "the collector still backs what it owes");
    }

    function test_SetCreatorShareBps_Bounds() public {
        collector.setCreatorShareBps(0);
        _collectNativeFor(creator, 1 ether);
        assertEq(collector.claimable(creator, address(0)), 0);
        assertEq(collector.claimable(treasury, address(0)), 1 ether);

        collector.setCreatorShareBps(10000);
        _collectNativeFor(creator, 1 ether);
        assertEq(collector.claimable(creator, address(0)), 1 ether);
        assertEq(collector.claimable(treasury, address(0)), 1 ether, "unchanged by the second fee");
    }

    function test_SetTreasury_LeavesCreditedBalances() public {
        _collectNativeFor(creator, 1 ether);
        address newTreasury = makeAddr("newTreasury");

        collector.setTreasury(newTreasury);
        _collectNativeFor(creator, 1 ether);

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
        _collectNativeFor(creator, amount);

        assertEq(collector.claimable(creator, address(0)) + collector.claimable(treasury, address(0)), amount);
    }
}

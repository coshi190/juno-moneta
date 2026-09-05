// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/FeeCollector.sol";
import "../src/ERC20Token.sol";
import "./mocks/MockV3Factory.sol";
import "./mocks/MockV3Pool.sol";
import "./mocks/MockPositionManager.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract HandlerReentrantActor {
    JunoBondingCurveV1_1 public immutable pump;
    address public target;
    uint256 public value;
    bool internal inside;

    constructor(JunoBondingCurveV1_1 _pump) {
        pump = _pump;
    }

    function arm(address _target, uint256 _value) external {
        target = _target;
        value = _value;
    }

    receive() external payable {
        if (inside || target == address(0) || address(this).balance < value) return;
        inside = true;
        try pump.buy{value: value}(target, 0) returns (uint256) {} catch {}
        inside = false;
    }
}

contract JunoBondingCurveV1_1Handler is Test {
    JunoBondingCurveV1_1 public pump;
    uint256 public immutable VIRTUAL_AMOUNT;
    uint256 public immutable GRADUATION_AMOUNT;
    uint256 public constant CREATE_FEE = 0.001 ether;

    address[] public tokens;
    address[4] internal actors;
    HandlerReentrantActor internal reentrant;
    bool public kViolated;

    receive() external payable {}

    constructor(JunoBondingCurveV1_1 _pump) {
        pump = _pump;
        VIRTUAL_AMOUNT = _pump.virtualAmount();
        GRADUATION_AMOUNT = _pump.graduationAmount();
        actors[0] = makeAddr("h_alice");
        actors[1] = makeAddr("h_bob");
        actors[2] = makeAddr("h_carol");
        reentrant = new HandlerReentrantActor(_pump);
        actors[3] = address(reentrant);
        for (uint256 i; i < actors.length; i++) {
            vm.deal(actors[i], 1_000 ether);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _k(address t) internal view returns (uint256) {
        (uint256 nat, uint256 tok) = pump.pumpReserve(t);
        return (VIRTUAL_AMOUNT + nat) * tok;
    }

    function createToken(uint256 actorSeed) public {
        address a = _actor(actorSeed);
        if (a.balance < CREATE_FEE) return;
        vm.prank(a);
        try pump.createToken{value: CREATE_FEE}("T", "T", "", "", "", "", "") returns (address t) {
            tokens.push(t);
        } catch {}
    }

    function buy(uint256 actorSeed, uint256 tokenSeed, uint256 amount) public {
        if (tokens.length == 0) return;
        address t = tokens[tokenSeed % tokens.length];
        if (pump.isGraduate(t)) return;
        address a = _actor(actorSeed);
        amount = bound(amount, 1e9, 50 ether);
        if (a.balance < amount) return;
        if (a == address(reentrant)) reentrant.arm(t, 1e15);

        uint256 kBefore = _k(t);
        vm.prank(a);
        try pump.buy{value: amount}(t, 0) returns (uint256) {
            if (_k(t) < kBefore) kViolated = true;
        } catch {}
    }

    function sell(uint256 actorSeed, uint256 tokenSeed, uint256 amountSeed) public {
        if (tokens.length == 0) return;
        address t = tokens[tokenSeed % tokens.length];
        if (pump.isGraduate(t)) return;
        address a = _actor(actorSeed);
        uint256 bal = ERC20Token(t).balanceOf(a);
        if (bal == 0) return;
        uint256 amount = bound(amountSeed, 1, bal);
        if (a == address(reentrant)) reentrant.arm(t, 1e15);

        uint256 kBefore = _k(t);
        vm.startPrank(a);
        ERC20Token(t).approve(address(pump), amount);
        try pump.sell(t, amount, 0) returns (uint256) {
            if (_k(t) < kBefore) kViolated = true;
        } catch {}
        vm.stopPrank();
    }

    function graduate(uint256 tokenSeed) public {
        if (tokens.length == 0) return;
        address t = tokens[tokenSeed % tokens.length];
        if (pump.isGraduate(t)) return;
        (uint256 nat,) = pump.pumpReserve(t);
        if (nat < GRADUATION_AMOUNT) return;
        try pump.graduate(t) returns (bool) {} catch {}
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function tokenAt(uint256 i) external view returns (address) {
        return tokens[i];
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }
}

contract JunoBondingCurveV1_1InvariantTest is Test {
    JunoBondingCurveV1_1 public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;
    JunoBondingCurveV1_1Handler public handler;
    FeeCollector public collector;
    uint256 internal virtualOffset;

    address public wrappedNative = address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);

    receive() external payable {}

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();
        factory.setMockPool(address(pool));
        posManager.setWrappedNative(wrappedNative);
        posManager.setPoolFactory(address(factory));

        address predictedCurve = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        collector = new FeeCollector(address(this), 5000, predictedCurve);
        pump = new JunoBondingCurveV1_1(
            wrappedNative, address(factory), address(posManager), address(collector), 0.34 ether, 0.4 ether
        );
        collector.setCurveFee(0.001 ether, 100);

        virtualOffset = pump.curveReserve() - pump.INITIALTOKEN();

        handler = new JunoBondingCurveV1_1Handler(pump);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.createToken.selector;
        selectors[1] = handler.buy.selector;
        selectors[2] = handler.sell.selector;
        selectors[3] = handler.graduate.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_LiveTokenAlwaysTradeable() public {
        uint256 n = handler.tokenCount();
        for (uint256 i; i < n; i++) {
            address t = handler.tokenAt(i);
            if (pump.isGraduate(t)) continue;
            (uint256 nat,) = pump.pumpReserve(t);
            if (nat >= 0.4 ether) continue;

            uint256 snap = vm.snapshotState();
            address prober = address(0xB0B);
            vm.deal(prober, 1 ether);
            vm.prank(prober);
            try pump.buy{value: 0.0001 ether}(t, 0) returns (uint256 out) {
                assertGt(out, 0, "a live token under the cap must return tokens for a real buy");
            } catch {
                vm.revertToState(snap);
                assertTrue(false, "a live token under the cap must remain buyable");
            }
            vm.revertToState(snap);
        }
    }

    function invariant_NativeSolvency() public {
        uint256 owed;
        uint256 n = handler.tokenCount();
        for (uint256 i; i < n; i++) {
            address t = handler.tokenAt(i);
            if (pump.isGraduate(t)) continue;
            (uint256 nat,) = pump.pumpReserve(t);
            owed += nat;
        }
        assertGe(address(pump).balance, owed);
    }

    function invariant_TokenBacking() public {
        uint256 n = handler.tokenCount();
        for (uint256 i; i < n; i++) {
            address t = handler.tokenAt(i);
            if (pump.isGraduate(t)) continue;
            (, uint256 tok) = pump.pumpReserve(t);
            assertGe(ERC20Token(t).balanceOf(address(pump)) + virtualOffset, tok);
        }
    }

    function invariant_LPConsumesHeldBalance() public {
        uint256 n = handler.tokenCount();
        for (uint256 i; i < n; i++) {
            address t = handler.tokenAt(i);
            if (pump.isGraduate(t)) continue;
            (uint256 nat, uint256 tok) = pump.pumpReserve(t);
            if (nat < handler.GRADUATION_AMOUNT()) continue;
            uint256 tokenLiquidity = Math.mulDiv(tok, nat, pump.virtualAmount() + nat);
            uint256 balance = ERC20Token(t).balanceOf(address(pump));
            assertLe(tokenLiquidity, balance, "LP position underfunded: graduate() would revert");
            assertLt(balance - tokenLiquidity, 1 ether, "unsold remainder is not dust: sold + LP != INITIALTOKEN");
        }
    }

    function invariant_NativeNeverExceedsCap() public {
        uint256 n = handler.tokenCount();
        for (uint256 i; i < n; i++) {
            address t = handler.tokenAt(i);
            if (pump.isGraduate(t)) continue;
            (uint256 nat,) = pump.pumpReserve(t);
            assertLe(nat, handler.GRADUATION_AMOUNT());
        }
    }

    function invariant_CollectorSolvency() public {
        uint256 owed = collector.claimable(address(this), address(0));
        uint256 n = handler.actorCount();
        for (uint256 i; i < n; i++) {
            owed += collector.claimable(handler.actorAt(i), address(0));
        }
        assertGe(address(collector).balance, owed);
    }

    function invariant_CurveKNeverDecreases() public {
        assertFalse(handler.kViolated());
    }
}

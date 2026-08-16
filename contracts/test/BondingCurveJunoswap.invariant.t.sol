// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../src/BondingCurveJunoswap.sol";
import "../src/ERC20Token.sol";
import "./mocks/MockV3Factory.sol";
import "./mocks/MockV3Pool.sol";
import "./mocks/MockPositionManager.sol";

contract BondingCurveHandler is Test {
    BondingCurveJunoswap public pump;
    uint256 public constant INITIAL_NATIVE = 0.05 ether;
    uint256 public constant VIRTUAL_AMOUNT = 0.5 ether;
    uint256 public constant GRADUATION_AMOUNT = 0.2 ether;
    uint256 public constant CREATE_FEE = 0.001 ether;
    uint256 public constant INITIALTOKEN = 1_000_000_000 ether;

    address[] public tokens;
    address[3] internal actors;
    bool public kViolated;

    receive() external payable {}

    constructor(BondingCurveJunoswap _pump) {
        pump = _pump;
        actors[0] = makeAddr("h_alice");
        actors[1] = makeAddr("h_bob");
        actors[2] = makeAddr("h_carol");
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
        if (a.balance < CREATE_FEE + INITIAL_NATIVE) return;
        vm.prank(a);
        try pump.createToken{value: CREATE_FEE + INITIAL_NATIVE}("T", "T", "", "", "", "", "") returns (address t) {
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
        (uint256 nat, uint256 tok) = pump.pumpReserve(t);
        if (tok * GRADUATION_AMOUNT > nat * INITIALTOKEN) return;
        try pump.graduate(t) returns (bool) {} catch {}
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function tokenAt(uint256 i) external view returns (address) {
        return tokens[i];
    }
}

contract BondingCurveInvariantTest is Test {
    BondingCurveJunoswap public pump;
    MockV3Factory public factory;
    MockV3Pool public pool;
    MockPositionManager public posManager;
    BondingCurveHandler public handler;

    address public wrappedNative = address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);

    receive() external payable {}

    function setUp() public {
        factory = new MockV3Factory();
        pool = new MockV3Pool();
        posManager = new MockPositionManager();
        factory.setMockPool(address(pool));
        posManager.setWrappedNative(wrappedNative);

        pump = new BondingCurveJunoswap(wrappedNative, address(factory), address(posManager));
        pump.setCurveState(0.05 ether, 0.5 ether, 0.2 ether);
        pump.setFee(0.001 ether, 100);

        handler = new BondingCurveHandler(pump);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.createToken.selector;
        selectors[1] = handler.buy.selector;
        selectors[2] = handler.sell.selector;
        selectors[3] = handler.graduate.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
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
            assertGe(ERC20Token(t).balanceOf(address(pump)), tok);
        }
    }

    function invariant_GraduatedReservesZero() public {
        uint256 n = handler.tokenCount();
        for (uint256 i; i < n; i++) {
            address t = handler.tokenAt(i);
            if (!pump.isGraduate(t)) continue;
            (uint256 nat, uint256 tok) = pump.pumpReserve(t);
            assertEq(nat, 0);
            assertEq(tok, 0);
        }
    }

    function invariant_CurveKNeverDecreases() public {
        assertFalse(handler.kViolated());
    }
}

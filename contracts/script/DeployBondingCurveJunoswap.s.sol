// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import "../src/BondingCurveJunoswap.sol";

contract DeployBondingCurveJunoswap is Script {
    address constant WRAPPED_NATIVE_TESTNET = 0x700D3ba307E1256e509eD3E45D6f9dff441d6907;
    address constant V3_FACTORY_TESTNET = 0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b;
    address constant V3_POS_MANAGER_TESTNET = 0x690f45C21744eCC4ac0D897ACAC920889c3cFa4b;

    uint256 constant INITIAL_NATIVE = 0;
    uint256 constant VIRTUAL_AMOUNT = 3400000000000000000000;
    uint256 constant GRADUATION_AMOUNT = 4000000000000000000000;

    uint256 constant CREATE_FEE = 0.1 ether;
    uint256 constant PUMP_FEE = 100;

    function run() external {
        address wrappedNative = vm.envOr("WRAPPED_NATIVE", WRAPPED_NATIVE_TESTNET);
        address v3Factory = vm.envOr("V3_FACTORY", V3_FACTORY_TESTNET);
        address v3PosManager = vm.envOr("V3_POS_MANAGER", V3_POS_MANAGER_TESTNET);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        BondingCurveJunoswap pump = new BondingCurveJunoswap(wrappedNative, v3Factory, v3PosManager);

        pump.setCurveState(INITIAL_NATIVE, VIRTUAL_AMOUNT, GRADUATION_AMOUNT);
        pump.setFee(CREATE_FEE, PUMP_FEE);

        vm.stopBroadcast();

        console.log("BondingCurveJunoswap deployed at:", address(pump));
        console.log("feeCollector:", pump.feeCollector());
    }
}

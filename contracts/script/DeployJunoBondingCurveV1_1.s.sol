// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/FeeCollector.sol";

contract DeployJunoBondingCurveV1_1 is Script {
    address constant WRAPPED_NATIVE_TESTNET = 0x700D3ba307E1256e509eD3E45D6f9dff441d6907;
    address constant V3_FACTORY_TESTNET = 0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b;
    address constant V3_POS_MANAGER_TESTNET = 0x690f45C21744eCC4ac0D897ACAC920889c3cFa4b;

    uint256 constant VIRTUAL_AMOUNT = 3400000000000000000000;
    uint256 constant GRADUATION_AMOUNT = 4000000000000000000000;

    uint256 constant CREATE_FEE = 0.1 ether;
    uint256 constant PUMP_FEE = 100;
    uint256 constant CREATOR_SHARE_BPS = 5000;

    function run() external {
        address wrappedNative = vm.envOr("WRAPPED_NATIVE", WRAPPED_NATIVE_TESTNET);
        address v3Factory = vm.envOr("V3_FACTORY", V3_FACTORY_TESTNET);
        address v3PosManager = vm.envOr("V3_POS_MANAGER", V3_POS_MANAGER_TESTNET);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);

        vm.startBroadcast(deployerPrivateKey);

        address predictedCurve = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        FeeCollector collector = new FeeCollector(treasury, CREATOR_SHARE_BPS, predictedCurve);
        JunoBondingCurveV1_1 pump = new JunoBondingCurveV1_1(
            wrappedNative, v3Factory, v3PosManager, address(collector), VIRTUAL_AMOUNT, GRADUATION_AMOUNT
        );
        require(address(pump) == predictedCurve, "curve address mismatch");
        collector.setCurveFee(CREATE_FEE, PUMP_FEE);

        vm.stopBroadcast();

        console.log("JunoBondingCurveV1_1 deployed at:", address(pump));
        console.log("FeeCollector deployed at:", address(collector));
        console.log("feeCollector:", pump.feeCollector());
        console.log("collector.curve:", collector.curve());
        console.log("pumpFee:", pump.pumpFee());
        console.log("treasury:", collector.treasury());
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import "../src/JunoBondingCurveV1_1.sol";
import "../src/FeeCollector.sol";
import "../src/LpFeeLocker.sol";

contract DeployJunoBondingCurveV1_1 is Script {
    address constant V3_FACTORY_TESTNET = 0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b;
    address constant V3_POS_MANAGER_TESTNET = 0x690f45C21744eCC4ac0D897ACAC920889c3cFa4b;

    uint256 constant VIRTUAL_AMOUNT = 3400000000000000000000;
    uint256 constant GRADUATION_AMOUNT = 4000000000000000000000;

    uint256 constant CREATE_FEE = 0.1 ether;
    uint256 constant PUMP_FEE = 100;
    uint256 constant CREATOR_SHARE_BPS = 5000;

    function run() external {
        address v3Factory = vm.envOr("V3_FACTORY", V3_FACTORY_TESTNET);
        address v3PosManager = vm.envOr("V3_POS_MANAGER", V3_POS_MANAGER_TESTNET);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);

        vm.startBroadcast(deployerPrivateKey);

        uint256 nonce = vm.getNonce(deployer);
        address predictedLocker = vm.computeCreateAddress(deployer, nonce + 1);
        address predictedCurve = vm.computeCreateAddress(deployer, nonce + 2);
        FeeCollector collector =
            new FeeCollector(treasury, CREATOR_SHARE_BPS, predictedCurve, predictedLocker);
        LpFeeLocker locker = new LpFeeLocker(address(collector), v3PosManager);
        JunoBondingCurveV1_1 pump = new JunoBondingCurveV1_1(
            v3Factory,
            v3PosManager,
            address(collector),
            address(locker),
            VIRTUAL_AMOUNT,
            GRADUATION_AMOUNT
        );
        require(address(locker) == predictedLocker, "locker address mismatch");
        require(address(pump) == predictedCurve, "curve address mismatch");
        collector.setCurveFee(CREATE_FEE, PUMP_FEE);

        vm.stopBroadcast();

        console.log("JunoBondingCurveV1_1 deployed at:", address(pump));
        console.log("FeeCollector deployed at:", address(collector));
        console.log("LpFeeLocker deployed at:", address(locker));
        console.log("feeCollector:", pump.feeCollector());
        console.log("collector.curve:", collector.curve());
        console.log("collector.lpLocker:", collector.lpLocker());
        console.log("curve.lpLocker:", pump.lpLocker());
        console.log("locker.curve:", locker.curve());
        console.log("curve.wrappedNative:", address(pump.wrappedNative()));
        console.log("locker.wrappedNative:", locker.wrappedNative());
        console.log("pumpFee:", pump.pumpFee());
        console.log("treasury:", collector.treasury());
    }
}

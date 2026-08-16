// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import "../src/AggRouterJunoswap.sol";

contract DeployAggRouterJunoswap is Script {
    uint256 constant CHAIN_BITKUB = 96;
    uint256 constant CHAIN_KUB_TESTNET = 25925;
    uint256 constant CHAIN_JBC = 8899;

    address constant KKUB = 0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5;
    address constant TKKUB = 0x700D3ba307E1256e509eD3E45D6f9dff441d6907;
    address constant JBC_WNATIVE = 0x99999999990FC47611b74827486218f3398A4abD;

    address constant JUNOSWAP_V3_BITKUB = 0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C;
    address constant KUBLERX_V3_BITKUB = 0xD679d310008A2595B8d3DeB83bb93EB23F9b0942;
    address constant UDONSWAP_V2_BITKUB = 0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1;
    address constant PONDER_V2_BITKUB = 0x20B17e92Dd1866eC647ACaA38fe1f7075e4B359E;
    address constant DIAMON_V2_BITKUB = 0x6E906Dc4749642a456907deCB323A0065dC6F26E;

    address constant JUNOSWAP_V3_TESTNET = 0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b;

    address constant JUNOSWAP_V3_JBC = 0x5835f123bDF137864263bf204Cf4450aAD1Ba3a7;
    address constant JIBSWAP_V2_JBC = 0x4BBdA880C5A0cDcEc6510f0450c6C8bC5773D499;

    function run() external {
        address wrappedNative = vm.envOr("WRAPPED_NATIVE", _defaultWrappedNative());
        require(wrappedNative != address(0), "set WRAPPED_NATIVE for this chain");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        AggRouterJunoswap router = new AggRouterJunoswap(wrappedNative);
        _registerFactories(router);

        address feeCollector = vm.envOr("FEE_COLLECTOR", address(0));
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(0)));
        if (feeCollector != address(0)) router.setFee(feeCollector, feeBps);

        vm.stopBroadcast();

        console.log("AggRouterJunoswap deployed at:", address(router));
        console.log("chainId:", block.chainid);
        console.log("wrappedNative:", wrappedNative);
        console.log("feeCollector:", feeCollector);
        console.log("feeBps:", feeBps);
    }

    function _defaultWrappedNative() internal view returns (address) {
        if (block.chainid == CHAIN_BITKUB) return KKUB;
        if (block.chainid == CHAIN_KUB_TESTNET) return TKKUB;
        if (block.chainid == CHAIN_JBC) return JBC_WNATIVE;
        return address(0);
    }

    function _registerFactories(AggRouterJunoswap router) internal {
        uint8 v2 = router.KIND_V2();
        uint8 v3 = router.KIND_V3();
        uint8 v2nd = router.KIND_V2_NODATA();

        if (block.chainid == CHAIN_BITKUB) {
            router.setFactory(JUNOSWAP_V3_BITKUB, v3, 0);
            router.setFactory(KUBLERX_V3_BITKUB, v3, 0);
            router.setFactory(UDONSWAP_V2_BITKUB, v2nd, 25);
            router.setFactory(PONDER_V2_BITKUB, v2, 30);
            router.setFactory(DIAMON_V2_BITKUB, v2nd, 30);
        } else if (block.chainid == CHAIN_KUB_TESTNET) {
            router.setFactory(JUNOSWAP_V3_TESTNET, v3, 0);
        } else if (block.chainid == CHAIN_JBC) {
            router.setFactory(JUNOSWAP_V3_JBC, v3, 0);
            router.setFactory(JIBSWAP_V2_JBC, v2, 30);
        } else {
            revert("no factory set for chain");
        }
    }
}

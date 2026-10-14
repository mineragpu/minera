// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {PairZap} from "../src/PairZap.sol";

/// @notice Deploys a pair zap for a network whose Burn Pool and rig registry already exist, with
/// the routes in `deploy/<NETWORK>-zap.json`. The guardian then allows the zap on the pool and
/// lists each asset on the registry; both take effect only after their public delays.
contract DeployZap is Script {
    error WrongChain(uint256 expected, uint256 actual);
    error UnsafeConfig(string reason);

    struct ZapConfig {
        uint256 chainId;
        address router;
        address stockRegistry;
        PairZap.Route[] routes;
    }

    function run() external {
        string memory network = vm.envString("NETWORK");
        ZapConfig memory config = configFrom(vm.readFile(string.concat("deploy/", network, "-zap.json")));
        if (block.chainid != config.chainId) revert WrongChain(config.chainId, block.chainid);
        check(config);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        PairZap zap = new PairZap(config.router, config.stockRegistry, config.routes);
        vm.stopBroadcast();

        // A dry run simulates the deployment; only a broadcast leaves a record of an address.
        bool broadcast =
            vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (!broadcast) return;
        string memory key = "zap";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "router", config.router);
        vm.serializeAddress(key, "stockRegistry", config.stockRegistry);
        string memory out = vm.serializeAddress(key, "pairZap", address(zap));
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), "-zap.json"));
    }

    function configFrom(string memory json) public pure returns (ZapConfig memory config) {
        config.chainId = vm.parseJsonUint(json, ".chainId");
        config.router = vm.parseJsonAddress(json, ".router");
        config.stockRegistry = vm.parseJsonAddress(json, ".stockRegistry");
        config.routes = abi.decode(vm.parseJson(json, ".routes"), (PairZap.Route[]));
    }

    /// @notice Refuses a zap that could not deliver: a router, registry or asset without code, no
    /// routes, or a route without a valid fee and tick spacing. The constructor already refuses
    /// zero addresses and duplicate assets.
    function check(ZapConfig memory config) public view {
        if (config.router.code.length == 0) revert UnsafeConfig("router has no code");
        if (config.stockRegistry.code.length == 0) revert UnsafeConfig("stockRegistry has no code");
        if (config.routes.length == 0) revert UnsafeConfig("no routes");
        for (uint256 i = 0; i < config.routes.length; i++) {
            PairZap.Route memory route = config.routes[i];
            if (route.asset.code.length == 0) revert UnsafeConfig("a route asset has no code");
            if (route.fee == 0 || route.fee > 1_000_000) revert UnsafeConfig("a route fee is out of range");
            if (route.tickSpacing <= 0) revert UnsafeConfig("a route tick spacing is not positive");
        }
    }
}

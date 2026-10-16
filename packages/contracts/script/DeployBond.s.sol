// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {RigBond} from "../src/RigBond.sol";

interface IGuarded {
    function guardian() external view returns (address);
}

/// @notice Deploys the work bond next to an existing rig registry and Burn Pool, with the
/// parameters in `deploy/<NETWORK>-bond.json`. The bond's guardian must be the pool's own, so the
/// key that can veto a settlement is the only one that can slash a bond.
contract DeployBond is Script {
    error WrongChain(uint256 expected, uint256 actual);
    error UnsafeConfig(string reason);

    uint64 internal constant MIN_UNBOND_DELAY = 1 days;

    struct BondConfig {
        uint256 chainId;
        address registry;
        address burnPool;
        address guardian;
        uint256 minBond;
        uint64 unbondDelay;
        uint256 slashCampaign;
    }

    function run() external {
        string memory network = vm.envString("NETWORK");
        BondConfig memory config = configFrom(vm.readFile(string.concat("deploy/", network, "-bond.json")));
        if (block.chainid != config.chainId) revert WrongChain(config.chainId, block.chainid);
        check(config);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        RigBond bond = new RigBond(
            config.registry, config.burnPool, config.guardian, config.minBond, config.unbondDelay, config.slashCampaign
        );
        vm.stopBroadcast();

        // A dry run simulates the deployment; only a broadcast leaves a record of an address.
        bool broadcast =
            vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (!broadcast) return;
        string memory key = "bond";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "minBond", config.minBond);
        vm.serializeUint(key, "unbondDelay", config.unbondDelay);
        string memory out = vm.serializeAddress(key, "rigBond", address(bond));
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), "-bond.json"));
    }

    function configFrom(string memory json) public pure returns (BondConfig memory config) {
        config.chainId = vm.parseJsonUint(json, ".chainId");
        config.registry = vm.parseJsonAddress(json, ".registry");
        config.burnPool = vm.parseJsonAddress(json, ".burnPool");
        config.guardian = vm.parseJsonAddress(json, ".guardian");
        config.minBond = vm.parseJsonUint(json, ".minBond");
        config.unbondDelay = uint64(vm.parseJsonUint(json, ".unbondDelay"));
        config.slashCampaign = vm.parseJsonUint(json, ".slashCampaign");
    }

    /// @notice Refuses a bond that would not protect anything: no minimum, an unbonding delay too
    /// short to slash in, contracts without code, or a guardian other than the pool's.
    function check(BondConfig memory config) public view {
        if (config.registry.code.length == 0) revert UnsafeConfig("registry has no code");
        if (config.burnPool.code.length == 0) revert UnsafeConfig("burnPool has no code");
        if (config.minBond == 0) revert UnsafeConfig("minBond is zero");
        if (config.unbondDelay < MIN_UNBOND_DELAY) revert UnsafeConfig("unbondDelay is under a day");
        if (config.guardian != IGuarded(config.burnPool).guardian()) {
            revert UnsafeConfig("guardian is not the pool's guardian");
        }
    }
}

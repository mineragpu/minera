// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {BurnPool} from "../src/BurnPool.sol";
import {PairZap} from "../src/PairZap.sol";
import {RigRegistry} from "../src/RigRegistry.sol";

/// @notice Deploys the Burn Pool, the rig registry and the pair zap from `deploy/<NETWORK>.json`
/// and records the addresses in `deployments/<chainId>.json`.
/// @dev Environment: NETWORK (testnet | mainnet), DEPLOYER_PRIVATE_KEY, GUARDIAN_ADDRESS,
/// PUBLISHER_ADDRESS. When the deployer is also the guardian, the zap is scheduled on the pool and
/// every routed asset is listed on the registry in the same run.
contract Deploy is Script {
    struct Config {
        uint256 chainId;
        uint64 challengeDelay;
        uint64 rotationDelay;
        uint256 releaseBpsPerDay;
        uint64 listingDelay;
        address router;
        address stockRegistry;
    }

    uint64 private constant MAX_DELAY = 365 days;
    uint256 private constant BPS = 10_000;

    error WrongChain(uint256 expected, uint256 actual);
    error UnsafeConfig(string reason);

    function run() external {
        string memory network = vm.envString("NETWORK");
        string memory json = vm.readFile(string.concat("deploy/", network, ".json"));
        Config memory config = configFrom(json);
        check(config);
        if (block.chainid != config.chainId) revert WrongChain(config.chainId, block.chainid);
        PairZap.Route[] memory routes = abi.decode(vm.parseJson(json, ".routes"), (PairZap.Route[]));

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address publisher = vm.envAddress("PUBLISHER_ADDRESS");

        vm.startBroadcast(deployerKey);
        BurnPool pool =
            new BurnPool(guardian, publisher, config.challengeDelay, config.rotationDelay, config.releaseBpsPerDay);
        RigRegistry registry = new RigRegistry(guardian, config.listingDelay);
        PairZap zap = new PairZap(config.router, config.stockRegistry, routes);
        if (deployer == guardian) {
            pool.allowZap(address(zap));
            for (uint256 i = 0; i < routes.length; i++) {
                registry.listPair(routes[i].asset);
            }
        }
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "guardian", guardian);
        vm.serializeAddress(key, "publisher", publisher);
        vm.serializeAddress(key, "burnPool", address(pool));
        vm.serializeAddress(key, "rigRegistry", address(registry));
        string memory out = vm.serializeAddress(key, "pairZap", address(zap));
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }

    /// @notice Refuses parameters the contracts accept but that would make them unsafe or stuck. The
    /// constructors leave the delays unbounded, so this is where they are held to sane values.
    function check(Config memory config) public pure {
        if (config.challengeDelay == 0) {
            revert UnsafeConfig("challengeDelay is zero, so no settlement could be vetoed");
        }
        if (config.rotationDelay < config.challengeDelay) {
            revert UnsafeConfig("rotationDelay is shorter than challengeDelay");
        }
        if (config.listingDelay == 0) {
            revert UnsafeConfig("listingDelay is zero, so a new pair would be usable at once");
        }
        if (config.challengeDelay > MAX_DELAY || config.rotationDelay > MAX_DELAY || config.listingDelay > MAX_DELAY) {
            revert UnsafeConfig("a delay is longer than a year");
        }
        if (config.releaseBpsPerDay == 0 || config.releaseBpsPerDay > BPS) {
            revert UnsafeConfig("releaseBpsPerDay is outside 1 to 10000");
        }
        if (config.router == address(0) || config.stockRegistry == address(0)) {
            revert UnsafeConfig("router or stockRegistry is the zero address");
        }
    }

    function configFrom(string memory json) public pure returns (Config memory config) {
        config.chainId = vm.parseJsonUint(json, ".chainId");
        config.challengeDelay = uint64(vm.parseJsonUint(json, ".challengeDelay"));
        config.rotationDelay = uint64(vm.parseJsonUint(json, ".rotationDelay"));
        config.releaseBpsPerDay = vm.parseJsonUint(json, ".releaseBpsPerDay");
        config.listingDelay = uint64(vm.parseJsonUint(json, ".listingDelay"));
        config.router = vm.parseJsonAddress(json, ".router");
        config.stockRegistry = vm.parseJsonAddress(json, ".stockRegistry");
    }
}

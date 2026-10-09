// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

/// @notice The deploy script refuses parameters the constructors would accept but that make the
/// contracts unsafe or stuck.
contract DeployConfigTest is Test {
    Deploy internal deployer;
    Deploy.Config internal testnet;

    function setUp() public {
        deployer = new Deploy();
        testnet = deployer.configFrom(vm.readFile("deploy/testnet.json"));
    }

    function _expectUnsafe(Deploy.Config memory config, string memory reason) internal {
        vm.expectRevert(abi.encodeWithSelector(Deploy.UnsafeConfig.selector, reason));
        deployer.check(config);
    }

    function test_TestnetConfigPasses() public view {
        deployer.check(testnet);
        assertEq(testnet.chainId, 46630);
    }

    function test_RevertWhen_ChallengeDelayIsZero() public {
        Deploy.Config memory config = testnet;
        config.challengeDelay = 0;
        _expectUnsafe(config, "challengeDelay is zero, so no settlement could be vetoed");
    }

    function test_RevertWhen_RotationIsFasterThanChallenge() public {
        Deploy.Config memory config = testnet;
        config.rotationDelay = config.challengeDelay - 1;
        _expectUnsafe(config, "rotationDelay is shorter than challengeDelay");
    }

    function test_RevertWhen_ListingDelayIsZero() public {
        Deploy.Config memory config = testnet;
        config.listingDelay = 0;
        _expectUnsafe(config, "listingDelay is zero, so a new pair would be usable at once");
    }

    function test_RevertWhen_ADelayIsLongerThanAYear() public {
        Deploy.Config memory config = testnet;
        config.rotationDelay = 365 days + 1;
        _expectUnsafe(config, "a delay is longer than a year");
    }

    function test_RevertWhen_ReleaseRateIsOutOfRange() public {
        Deploy.Config memory config = testnet;
        config.releaseBpsPerDay = 0;
        _expectUnsafe(config, "releaseBpsPerDay is outside 1 to 10000");
        config.releaseBpsPerDay = 10_001;
        _expectUnsafe(config, "releaseBpsPerDay is outside 1 to 10000");
    }

    function test_TestnetRolesPass() public {
        deployer.checkRoles("testnet", testnet, makeAddr("deployer"), makeAddr("guardian"), makeAddr("publisher"));
    }

    function test_RevertWhen_GuardianIsThePublisher() public {
        address key = makeAddr("one key");
        vm.expectRevert(
            abi.encodeWithSelector(Deploy.UnsafeConfig.selector, "the guardian and the publisher are the same key")
        );
        deployer.checkRoles("testnet", testnet, makeAddr("deployer"), key, key);
    }

    function test_RevertWhen_MainnetGuardianIsTheDeployer() public {
        address key = makeAddr("deployer");
        vm.expectRevert(
            abi.encodeWithSelector(Deploy.UnsafeConfig.selector, "on mainnet the guardian must not be the deployer")
        );
        deployer.checkRoles("mainnet", _mainnetLike(), key, key, makeAddr("publisher"));
    }

    function test_RevertWhen_MainnetChallengeDelayIsUnderAnHour() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.UnsafeConfig.selector, "on mainnet the challenge delay must be at least an hour"
            )
        );
        deployer.checkRoles("mainnet", testnet, makeAddr("deployer"), makeAddr("guardian"), makeAddr("publisher"));
    }

    function test_MainnetConfigAndRolesPass() public {
        Deploy.Config memory mainnet = deployer.configFrom(vm.readFile("deploy/mainnet.json"));
        deployer.check(mainnet);
        assertEq(mainnet.chainId, 4663);
        deployer.checkRoles("mainnet", mainnet, makeAddr("deployer"), makeAddr("guardian"), makeAddr("publisher"));
    }

    function test_EthOnlyConfigPasses() public view {
        Deploy.Config memory config = testnet;
        config.router = address(0);
        config.stockRegistry = address(0);
        deployer.check(config);
    }

    function test_RevertWhen_OnlyOneSwapAddressIsSet() public {
        Deploy.Config memory config = testnet;
        config.router = address(0);
        _expectUnsafe(config, "set both router and stockRegistry, or neither for ETH-only");
    }

    function _mainnetLike() internal view returns (Deploy.Config memory config) {
        config = testnet;
        config.challengeDelay = 6 hours;
        config.rotationDelay = 2 days;
    }
}

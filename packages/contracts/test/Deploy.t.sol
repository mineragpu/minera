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
        deployer.checkRoles("testnet", testnet, makeAddr("guardian"), makeAddr("publisher"));
    }

    function test_RevertWhen_GuardianIsThePublisher() public {
        address key = makeAddr("one key");
        vm.expectRevert(
            abi.encodeWithSelector(Deploy.UnsafeConfig.selector, "the guardian and the publisher are the same key")
        );
        deployer.checkRoles("testnet", testnet, key, key);
    }

    function test_RevertWhen_MainnetGuardianIsNotAContract() public {
        Deploy.Config memory config = testnet;
        config.challengeDelay = 6 hours;
        config.rotationDelay = 2 days;
        vm.expectRevert(
            abi.encodeWithSelector(Deploy.UnsafeConfig.selector, "on mainnet the guardian must be a multisig contract")
        );
        deployer.checkRoles("mainnet", config, makeAddr("guardian"), makeAddr("publisher"));
    }

    function test_RevertWhen_MainnetChallengeDelayIsUnderAnHour() public {
        address multisig = makeAddr("multisig");
        vm.etch(multisig, hex"00");
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.UnsafeConfig.selector, "on mainnet the challenge delay must be at least an hour"
            )
        );
        deployer.checkRoles("mainnet", testnet, multisig, makeAddr("publisher"));
    }

    function test_MainnetRolesPassWithAMultisigGuardian() public {
        address multisig = makeAddr("multisig");
        vm.etch(multisig, hex"00");
        Deploy.Config memory config = testnet;
        config.challengeDelay = 6 hours;
        config.rotationDelay = 2 days;
        deployer.checkRoles("mainnet", config, multisig, makeAddr("publisher"));
    }

    function test_RevertWhen_RouterIsMissing() public {
        Deploy.Config memory config = testnet;
        config.router = address(0);
        _expectUnsafe(config, "router or stockRegistry is the zero address");
    }
}

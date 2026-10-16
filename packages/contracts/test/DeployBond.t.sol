// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployBond} from "../script/DeployBond.s.sol";
import {BurnPool} from "../src/BurnPool.sol";
import {RigRegistry} from "../src/RigRegistry.sol";

/// @notice The bond deploy script reads its parameters from its config and refuses a bond that
/// would not protect anything.
contract DeployBondTest is Test {
    DeployBond internal script;
    DeployBond.BondConfig internal config;
    address internal guardian = makeAddr("guardian");

    function setUp() public {
        script = new DeployBond();
        config.chainId = 4663;
        config.registry = address(new RigRegistry(guardian, 1 days));
        config.burnPool = address(new BurnPool(guardian, makeAddr("publisher"), 6 hours, 2 days, 1_000));
        config.guardian = guardian;
        config.minBond = 0.005 ether;
        config.unbondDelay = 7 days;
        config.slashCampaign = 0;
    }

    function _expectUnsafe(string memory reason) internal {
        vm.expectRevert(abi.encodeWithSelector(DeployBond.UnsafeConfig.selector, reason));
        script.check(config);
    }

    function test_MainnetConfigReadsItsParameters() public view {
        DeployBond.BondConfig memory mainnet = script.configFrom(vm.readFile("deploy/mainnet-bond.json"));
        assertEq(mainnet.chainId, 4663);
        assertEq(mainnet.registry, 0xbe078e15cF90c21Bf23BCFBE94DBC9E44ceFd4d1);
        assertEq(mainnet.burnPool, 0xa9f0BaB0AE7cc4A7B605D831d57A3A2a0E7921D8);
        assertEq(mainnet.guardian, 0x90F4B2B88C3459555977B153ebA6BACB4420EADA);
        assertEq(mainnet.minBond, 0.005 ether);
        assertEq(mainnet.unbondDelay, 7 days);
        assertEq(mainnet.slashCampaign, 0);
    }

    function test_AcceptsASafeConfig() public view {
        script.check(config);
    }

    function test_RefusesContractsWithoutCode() public {
        config.registry = makeAddr("empty");
        _expectUnsafe("registry has no code");
        setUp();
        config.burnPool = makeAddr("empty");
        _expectUnsafe("burnPool has no code");
    }

    function test_RefusesABondThatProtectsNothing() public {
        config.minBond = 0;
        _expectUnsafe("minBond is zero");
        setUp();
        config.unbondDelay = 1 days - 1;
        _expectUnsafe("unbondDelay is under a day");
    }

    function test_RefusesAGuardianOtherThanThePools() public {
        config.guardian = makeAddr("someone else");
        _expectUnsafe("guardian is not the pool's guardian");
    }
}

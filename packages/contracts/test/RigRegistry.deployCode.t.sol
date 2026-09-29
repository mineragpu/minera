// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {RigRegistry} from "../src/RigRegistry.sol";

/// @notice Deploys a rig with a deploy code produced by the node client, proving the off-chain
/// digest and signature match what the registry verifies.
/// @dev The digest binds the registry's address and the chain id, so each test places the registry
/// at the fixture's address and sets the chain id before deploying.
contract RigRegistryDeployCodeTest is Test {
    struct Fixture {
        uint256 chainId;
        address registry;
        address operator;
        address nodeKey;
        bytes32 digest;
        bytes deployCode;
    }

    function _fixture() internal view returns (Fixture memory fixture) {
        string memory json = vm.readFile("test/fixtures/deploy-code.json");
        fixture.chainId = vm.parseJsonUint(json, ".chainId");
        fixture.registry = vm.parseJsonAddress(json, ".registry");
        fixture.operator = vm.parseJsonAddress(json, ".operator");
        fixture.nodeKey = vm.parseJsonAddress(json, ".nodeKey");
        fixture.digest = vm.parseJsonBytes32(json, ".digest");
        fixture.deployCode = vm.parseJsonBytes(json, ".deployCode");
    }

    function _placeRegistry(uint256 chainId, address at) internal returns (RigRegistry) {
        vm.chainId(chainId);
        deployCodeTo("RigRegistry.sol:RigRegistry", abi.encode(makeAddr("guardian"), uint64(1 days)), at);
        return RigRegistry(at);
    }

    function test_NodeClientDeployCodeDeploysTheRig() public {
        Fixture memory fixture = _fixture();
        RigRegistry registry = _placeRegistry(fixture.chainId, fixture.registry);
        assertEq(registry.deployDigest(fixture.operator), fixture.digest);

        vm.prank(fixture.operator);
        registry.deploy(fixture.nodeKey, address(0), "Fixture Rig", fixture.deployCode);

        (address operator, address pair,, bool retired) = registry.rigs(fixture.nodeKey);
        assertEq(operator, fixture.operator);
        assertEq(pair, address(0));
        assertFalse(retired);
        assertEq(registry.rigCount(), 1);
    }

    function test_RevertWhen_DeployCodeIsUsedOnAnotherChain() public {
        Fixture memory fixture = _fixture();
        RigRegistry registry = _placeRegistry(fixture.chainId + 1, fixture.registry);

        vm.prank(fixture.operator);
        vm.expectRevert(RigRegistry.InvalidAuthorization.selector);
        registry.deploy(fixture.nodeKey, address(0), "Fixture Rig", fixture.deployCode);
    }

    function test_RevertWhen_DeployCodeIsUsedByAnotherOperator() public {
        Fixture memory fixture = _fixture();
        RigRegistry registry = _placeRegistry(fixture.chainId, fixture.registry);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(RigRegistry.InvalidAuthorization.selector);
        registry.deploy(fixture.nodeKey, address(0), "Fixture Rig", fixture.deployCode);
    }
}

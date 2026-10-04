// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {RigRegistry} from "../src/RigRegistry.sol";

contract StockTokenStub {}

contract RigRegistryTest is Test {
    uint64 internal constant LISTING_DELAY = 1 days;

    event RigDeployed(address indexed nodeKey, address indexed operator, address indexed pair, string name);

    RigRegistry internal registry;
    address internal guardian = makeAddr("guardian");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");
    address internal stock;

    uint256 internal nodePrivateKey = 0xA11CE;
    address internal nodeKey;

    function setUp() public {
        registry = new RigRegistry(guardian, LISTING_DELAY);
        stock = address(new StockTokenStub());
        nodeKey = vm.addr(nodePrivateKey);
    }

    function _authorize(uint256 privateKey, address forOperator) internal view returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(registry.deployDigest(forOperator));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _deploy(address pair) internal {
        bytes memory auth = _authorize(nodePrivateKey, operator);
        vm.prank(operator);
        registry.deploy(nodeKey, pair, "Night Shift", auth);
    }

    function _listStock() internal {
        vm.prank(guardian);
        registry.listPair(stock);
        vm.warp(block.timestamp + LISTING_DELAY);
    }

    function test_DeployPairedWithEth() public {
        vm.expectEmit(address(registry));
        emit RigDeployed(nodeKey, operator, address(0), "Night Shift");
        _deploy(address(0));

        (address rigOperator, address pair, uint64 deployedAt, bool retired) = registry.rigs(nodeKey);
        assertEq(rigOperator, operator);
        assertEq(pair, address(0));
        assertEq(deployedAt, block.timestamp);
        assertFalse(retired);
        assertEq(registry.rigCount(), 1);
    }

    function test_RevertWhen_AuthorizationIsForAnotherOperator() public {
        bytes memory auth = _authorize(nodePrivateKey, operator);
        vm.prank(stranger);
        vm.expectRevert(RigRegistry.InvalidAuthorization.selector);
        registry.deploy(nodeKey, address(0), "Night Shift", auth);
    }

    function test_RevertWhen_AuthorizationIsFromAnotherKey() public {
        bytes memory auth = _authorize(0xB0B, operator);
        vm.prank(operator);
        vm.expectRevert(RigRegistry.InvalidAuthorization.selector);
        registry.deploy(nodeKey, address(0), "Night Shift", auth);
    }

    function test_RevertWhen_DeployedTwice() public {
        _deploy(address(0));
        bytes memory auth = _authorize(nodePrivateKey, operator);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.AlreadyDeployed.selector, nodeKey));
        registry.deploy(nodeKey, address(0), "Night Shift", auth);
    }

    function test_RevertWhen_NameIsEmptyOrTooLong() public {
        bytes memory auth = _authorize(nodePrivateKey, operator);
        vm.startPrank(operator);
        vm.expectRevert(RigRegistry.InvalidName.selector);
        registry.deploy(nodeKey, address(0), "", auth);
        vm.expectRevert(RigRegistry.InvalidName.selector);
        registry.deploy(nodeKey, address(0), "a name that runs well past thirty-two bytes", auth);
        vm.stopPrank();
    }

    function test_StockPairUsableOnlyAfterListingDelay() public {
        vm.prank(guardian);
        registry.listPair(stock);
        assertFalse(registry.isPairListed(stock));

        bytes memory auth = _authorize(nodePrivateKey, operator);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.PairNotListed.selector, stock));
        registry.deploy(nodeKey, stock, "Night Shift", auth);

        vm.warp(block.timestamp + LISTING_DELAY);
        assertTrue(registry.isPairListed(stock));
        _deploy(stock);
        (, address pair,,) = registry.rigs(nodeKey);
        assertEq(pair, stock);
    }

    function test_OperatorChangesPair() public {
        _deploy(address(0));
        _listStock();
        vm.prank(operator);
        registry.setPair(nodeKey, stock);
        (, address pair,,) = registry.rigs(nodeKey);
        assertEq(pair, stock);
    }

    function test_RevertWhen_StrangerChangesPair() public {
        _deploy(address(0));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.NotOperator.selector, nodeKey));
        registry.setPair(nodeKey, address(0));
    }

    function test_DelistedPairBlocksNewDeploys() public {
        _listStock();
        vm.prank(guardian);
        registry.delistPair(stock);
        bytes memory auth = _authorize(nodePrivateKey, operator);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.PairNotListed.selector, stock));
        registry.deploy(nodeKey, stock, "Night Shift", auth);
    }

    function test_RetiredRigCannotChangeOrRedeploy() public {
        _deploy(address(0));
        vm.prank(operator);
        registry.retire(nodeKey);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.RigIsRetired.selector, nodeKey));
        registry.setPair(nodeKey, address(0));

        bytes memory auth = _authorize(nodePrivateKey, operator);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.AlreadyDeployed.selector, nodeKey));
        registry.deploy(nodeKey, address(0), "Night Shift", auth);
    }

    function test_RevertWhen_NonGuardianListsPair() public {
        vm.prank(stranger);
        vm.expectRevert(RigRegistry.NotGuardian.selector);
        registry.listPair(stock);
    }

    function test_RevertWhen_ListingAnAddressWithoutCode() public {
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.NotAContract.selector, stranger));
        registry.listPair(stranger);
    }

    function test_RevertWhen_ConstructedWithoutGuardian() public {
        vm.expectRevert(RigRegistry.ZeroAddress.selector);
        new RigRegistry(address(0), LISTING_DELAY);
    }

    function test_RevertWhen_ChangingAnUnknownRig() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.UnknownRig.selector, nodeKey));
        registry.setPair(nodeKey, address(0));
    }

    function test_RevertWhen_ChangingToAnUnlistedPair() public {
        _deploy(address(0));
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigRegistry.PairNotListed.selector, stock));
        registry.setPair(nodeKey, stock);
    }

    function test_RevertWhen_NonGuardianDelistsPair() public {
        _listStock();
        vm.prank(stranger);
        vm.expectRevert(RigRegistry.NotGuardian.selector);
        registry.delistPair(stock);
    }

    function test_DigestBindsChainRegistryAndOperator() public {
        bytes32 forOperator = registry.deployDigest(operator);
        assertTrue(forOperator != registry.deployDigest(stranger));
        vm.chainId(46630);
        assertTrue(forOperator != registry.deployDigest(operator));
    }
}

// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {BurnPool} from "../src/BurnPool.sol";
import {RigBond} from "../src/RigBond.sol";
import {RigRegistry} from "../src/RigRegistry.sol";

/// An operator that tries to withdraw again from inside the payment it receives.
contract ReenteringOperator {
    RigBond internal immutable bondContract;
    address internal immutable nodeKey;
    bool internal reentered;

    constructor(RigBond bond_, address nodeKey_) {
        bondContract = bond_;
        nodeKey = nodeKey_;
    }

    function deploy(RigRegistry registry, bytes calldata auth) external {
        registry.deploy(nodeKey, address(0), "Loop", auth);
    }

    function bond() external payable {
        bondContract.bond{value: msg.value}(nodeKey);
    }

    function requestUnbond() external {
        bondContract.requestUnbond(nodeKey);
    }

    function withdraw() external {
        bondContract.withdraw(nodeKey);
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            bondContract.withdraw(nodeKey);
        }
    }
}

/// An operator whose wallet refuses ETH.
contract RefusingOperator {
    function deploy(RigRegistry registry, address nodeKey, bytes calldata auth) external {
        registry.deploy(nodeKey, address(0), "Wall", auth);
    }

    function bond(RigBond bond_, address nodeKey) external payable {
        bond_.bond{value: msg.value}(nodeKey);
    }

    function requestUnbond(RigBond bond_, address nodeKey) external {
        bond_.requestUnbond(nodeKey);
    }

    function withdraw(RigBond bond_, address nodeKey) external {
        bond_.withdraw(nodeKey);
    }
}

contract RigBondTest is Test {
    uint256 internal constant MIN_BOND = 0.01 ether;
    uint64 internal constant UNBOND_DELAY = 7 days;
    uint256 internal constant SLASH_CAMPAIGN = 9;
    bytes32 internal constant REASON = "tiebreak lost x3";

    event Bonded(address indexed nodeKey, address indexed operator, uint256 amount, uint256 total);
    event UnbondRequested(address indexed nodeKey, uint64 unlockAt);
    event Withdrawn(address indexed nodeKey, address indexed operator, uint256 amount);
    event Slashed(address indexed nodeKey, uint256 amount, bytes32 reason);
    event Burned(address indexed from, uint256 amount, uint256 indexed campaignId, bytes32 memo);

    RigRegistry internal registry;
    BurnPool internal pool;
    RigBond internal bond;
    address internal guardian = makeAddr("guardian");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");
    uint256 internal nodePrivateKey = 0xB0B;
    address internal nodeKey;

    function setUp() public {
        registry = new RigRegistry(guardian, 1 days);
        pool = new BurnPool(guardian, makeAddr("publisher"), 6 hours, 2 days, 1_000);
        bond = new RigBond(address(registry), address(pool), guardian, MIN_BOND, UNBOND_DELAY, SLASH_CAMPAIGN);
        nodeKey = vm.addr(nodePrivateKey);
        _deploy(nodePrivateKey, operator);
        vm.deal(operator, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    function _auth(uint256 privateKey, address forOperator) internal view returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(registry.deployDigest(forOperator));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _deploy(uint256 privateKey, address forOperator) internal {
        bytes memory auth = _auth(privateKey, forOperator);
        vm.prank(forOperator);
        registry.deploy(vm.addr(privateKey), address(0), "Night Shift", auth);
    }

    function _bond(uint256 amount) internal {
        vm.prank(operator);
        bond.bond{value: amount}(nodeKey);
    }

    function _held() internal view returns (uint256 amount, uint64 unlockAt) {
        (amount, unlockAt) = bond.bonds(nodeKey);
    }

    // ------------------------------------------------------------------ construction

    function test_RecordsItsParameters() public view {
        assertEq(address(bond.registry()), address(registry));
        assertEq(address(bond.burnPool()), address(pool));
        assertEq(bond.guardian(), guardian);
        assertEq(bond.minBond(), MIN_BOND);
        assertEq(bond.unbondDelay(), UNBOND_DELAY);
        assertEq(bond.slashCampaign(), SLASH_CAMPAIGN);
    }

    function test_RevertWhen_ConstructedWithoutAGuardian() public {
        vm.expectRevert(RigBond.ZeroAddress.selector);
        new RigBond(address(registry), address(pool), address(0), MIN_BOND, UNBOND_DELAY, SLASH_CAMPAIGN);
    }

    function test_RevertWhen_TheRegistryIsNotAContract() public {
        vm.expectRevert(abi.encodeWithSelector(RigBond.NotAContract.selector, stranger));
        new RigBond(stranger, address(pool), guardian, MIN_BOND, UNBOND_DELAY, SLASH_CAMPAIGN);
    }

    function test_RevertWhen_ThePoolIsNotAContract() public {
        vm.expectRevert(abi.encodeWithSelector(RigBond.NotAContract.selector, stranger));
        new RigBond(address(registry), stranger, guardian, MIN_BOND, UNBOND_DELAY, SLASH_CAMPAIGN);
    }

    // ------------------------------------------------------------------ bonding

    function test_OperatorBondsAndTopsUp() public {
        vm.expectEmit(address(bond));
        emit Bonded(nodeKey, operator, 0.004 ether, 0.004 ether);
        _bond(0.004 ether);
        assertFalse(bond.isBonded(nodeKey));

        _bond(0.006 ether);
        (uint256 amount, uint64 unlockAt) = _held();
        assertEq(amount, MIN_BOND);
        assertEq(unlockAt, 0);
        assertTrue(bond.isBonded(nodeKey));
        assertEq(address(bond).balance, MIN_BOND);
    }

    function test_RevertWhen_BondingNothing() public {
        vm.prank(operator);
        vm.expectRevert(RigBond.NoBondSent.selector);
        bond.bond(nodeKey);
    }

    function test_RevertWhen_SomeoneElseBonds() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RigBond.NotOperator.selector, nodeKey));
        bond.bond{value: MIN_BOND}(nodeKey);
    }

    function test_RevertWhen_TheRigIsUnknown() public {
        address unknown = makeAddr("unknown");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigBond.UnknownRig.selector, unknown));
        bond.bond{value: MIN_BOND}(unknown);
    }

    function test_RevertWhen_BondingARetiredRig() public {
        vm.prank(operator);
        registry.retire(nodeKey);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigBond.RigIsRetired.selector, nodeKey));
        bond.bond{value: MIN_BOND}(nodeKey);
    }

    function test_NothingIsBondedByDefault() public view {
        assertFalse(bond.isBonded(nodeKey));
    }

    function test_AZeroMinimumStillNeedsSomeBond() public {
        RigBond free = new RigBond(address(registry), address(pool), guardian, 0, UNBOND_DELAY, SLASH_CAMPAIGN);
        assertFalse(free.isBonded(nodeKey));
        vm.prank(operator);
        free.bond{value: 1}(nodeKey);
        assertTrue(free.isBonded(nodeKey));
    }

    // ------------------------------------------------------------------ unbonding

    function test_UnbondingStopsTheBondCountingAtOnce() public {
        _bond(MIN_BOND);
        vm.expectEmit(address(bond));
        emit UnbondRequested(nodeKey, uint64(block.timestamp) + UNBOND_DELAY);
        vm.prank(operator);
        bond.requestUnbond(nodeKey);
        assertFalse(bond.isBonded(nodeKey));
    }

    function test_BondingAgainCancelsAnUnbond() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        bond.requestUnbond(nodeKey);
        _bond(1 wei);
        (, uint64 unlockAt) = _held();
        assertEq(unlockAt, 0);
        assertTrue(bond.isBonded(nodeKey));
    }

    function test_RevertWhen_UnbondingWithNothingBonded() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigBond.NothingBonded.selector, nodeKey));
        bond.requestUnbond(nodeKey);
    }

    function test_RevertWhen_SomeoneElseUnbonds() public {
        _bond(MIN_BOND);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RigBond.NotOperator.selector, nodeKey));
        bond.requestUnbond(nodeKey);
    }

    function test_ARetiredRigCanStillGetItsBondBack() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        registry.retire(nodeKey);
        vm.prank(operator);
        bond.requestUnbond(nodeKey);
        vm.warp(block.timestamp + UNBOND_DELAY);
        uint256 before = operator.balance;
        vm.prank(operator);
        bond.withdraw(nodeKey);
        assertEq(operator.balance, before + MIN_BOND);
    }

    // ------------------------------------------------------------------ withdrawing

    function test_WithdrawsAfterTheDelayToTheOperator() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        bond.requestUnbond(nodeKey);
        vm.warp(block.timestamp + UNBOND_DELAY);

        uint256 before = operator.balance;
        vm.expectEmit(address(bond));
        emit Withdrawn(nodeKey, operator, MIN_BOND);
        vm.prank(operator);
        bond.withdraw(nodeKey);
        assertEq(operator.balance, before + MIN_BOND);
        (uint256 amount, uint64 unlockAt) = _held();
        assertEq(amount, 0);
        assertEq(unlockAt, 0);
        assertEq(address(bond).balance, 0);
    }

    function test_RevertWhen_WithdrawingBeforeTheDelay() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        bond.requestUnbond(nodeKey);
        uint64 unlockAt = uint64(block.timestamp) + UNBOND_DELAY;
        vm.warp(unlockAt - 1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigBond.StillLocked.selector, nodeKey, unlockAt));
        bond.withdraw(nodeKey);
    }

    function test_RevertWhen_WithdrawingWithoutUnbonding() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigBond.NotUnbonding.selector, nodeKey));
        bond.withdraw(nodeKey);
    }

    function test_RevertWhen_WithdrawingNothing() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigBond.NothingBonded.selector, nodeKey));
        bond.withdraw(nodeKey);
    }

    function test_RevertWhen_SomeoneElseWithdraws() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        bond.requestUnbond(nodeKey);
        vm.warp(block.timestamp + UNBOND_DELAY);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RigBond.NotOperator.selector, nodeKey));
        bond.withdraw(nodeKey);
    }

    function test_RevertWhen_TheOperatorRefusesTheEth() public {
        RefusingOperator wall = new RefusingOperator();
        uint256 wallKey = 0xCAFE;
        bytes memory auth = _auth(wallKey, address(wall));
        wall.deploy(registry, vm.addr(wallKey), auth);
        vm.deal(address(this), 1 ether);
        wall.bond{value: MIN_BOND}(bond, vm.addr(wallKey));
        wall.requestUnbond(bond, vm.addr(wallKey));
        vm.warp(block.timestamp + UNBOND_DELAY);
        vm.expectRevert(RigBond.TransferFailed.selector);
        wall.withdraw(bond, vm.addr(wallKey));
    }

    function test_WithdrawCannotBeReentered() public {
        uint256 loopKey = 0xD00D;
        ReenteringOperator loop = new ReenteringOperator(bond, vm.addr(loopKey));
        loop.deploy(registry, _auth(loopKey, address(loop)));
        vm.deal(address(this), 1 ether);
        loop.bond{value: MIN_BOND}();
        _bond(MIN_BOND);
        loop.requestUnbond();
        vm.warp(block.timestamp + UNBOND_DELAY);
        vm.expectRevert(RigBond.TransferFailed.selector);
        loop.withdraw();
        assertEq(address(bond).balance, 2 * MIN_BOND);
    }

    // ------------------------------------------------------------------ slashing

    function test_GuardianSlashesIntoTheBurnPool() public {
        _bond(MIN_BOND);
        uint256 slashed = MIN_BOND / 4;
        vm.expectEmit(address(bond));
        emit Slashed(nodeKey, slashed, REASON);
        vm.expectEmit(address(pool));
        emit Burned(address(bond), slashed, SLASH_CAMPAIGN, REASON);
        vm.prank(guardian);
        bond.slash(nodeKey, slashed, REASON);

        (uint256 amount,) = _held();
        assertEq(amount, MIN_BOND - slashed);
        assertEq(address(pool).balance, slashed);
        assertEq(pool.totalBurned(), slashed);
        assertEq(guardian.balance, 0);
        assertFalse(bond.isBonded(nodeKey));
    }

    function test_GuardianCanSlashWhileTheBondIsUnbonding() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        bond.requestUnbond(nodeKey);
        vm.warp(block.timestamp + UNBOND_DELAY - 1);
        vm.prank(guardian);
        bond.slash(nodeKey, MIN_BOND, REASON);
        vm.warp(block.timestamp + 1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RigBond.NothingBonded.selector, nodeKey));
        bond.withdraw(nodeKey);
    }

    function test_RevertWhen_SomeoneOtherThanTheGuardianSlashes() public {
        _bond(MIN_BOND);
        vm.prank(operator);
        vm.expectRevert(RigBond.NotGuardian.selector);
        bond.slash(nodeKey, 1, REASON);
    }

    function test_RevertWhen_SlashingMoreThanTheBondOrNothing() public {
        _bond(MIN_BOND);
        vm.startPrank(guardian);
        vm.expectRevert(abi.encodeWithSelector(RigBond.SlashAboveBond.selector, nodeKey, MIN_BOND, MIN_BOND + 1));
        bond.slash(nodeKey, MIN_BOND + 1, REASON);
        vm.expectRevert(abi.encodeWithSelector(RigBond.SlashAboveBond.selector, nodeKey, MIN_BOND, 0));
        bond.slash(nodeKey, 0, REASON);
        vm.stopPrank();
    }

    /// Whatever is bonded and slashed, the bond keeps exactly what was not slashed, and every slashed
    /// wei is in the Burn Pool, never anywhere else.
    function testFuzz_SlashedEthOnlyEverReachesTheBurnPool(uint96 bonded, uint96 slashed) public {
        bonded = uint96(bound(bonded, 1, 5 ether));
        slashed = uint96(bound(slashed, 1, bonded));
        _bond(bonded);
        vm.prank(guardian);
        bond.slash(nodeKey, slashed, REASON);
        (uint256 amount,) = _held();
        assertEq(amount, bonded - slashed);
        assertEq(address(bond).balance, bonded - slashed);
        assertEq(address(pool).balance, slashed);
        assertEq(guardian.balance, 0);
    }
}

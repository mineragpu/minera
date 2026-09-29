// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BurnPool} from "../src/BurnPool.sol";
import {IPairZap} from "../src/interfaces/IPairZap.sol";

contract RecordingZap is IPairZap {
    address public lastAccount;
    uint256 public lastValue;

    function deliver(address account, bytes calldata) external payable {
        lastAccount = account;
        lastValue = msg.value;
    }
}

abstract contract PoolFixture is Test {
    uint64 internal constant CHALLENGE = 12 hours;
    uint64 internal constant ROTATION = 2 days;
    uint256 internal constant RELEASE_BPS = 200;

    BurnPool internal pool;
    address internal guardian = makeAddr("guardian");
    address internal publisher = makeAddr("publisher");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public virtual {
        pool = new BurnPool(guardian, publisher, CHALLENGE, ROTATION, RELEASE_BPS);
    }

    function _leaf(address account, uint256 cumulative) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, cumulative))));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _tree(uint256 aliceAmount, uint256 bobAmount)
        internal
        view
        returns (bytes32 root, bytes32[] memory aliceProof, bytes32[] memory bobProof)
    {
        bytes32 aliceLeaf = _leaf(alice, aliceAmount);
        bytes32 bobLeaf = _leaf(bob, bobAmount);
        root = _hashPair(aliceLeaf, bobLeaf);
        aliceProof = new bytes32[](1);
        aliceProof[0] = bobLeaf;
        bobProof = new bytes32[](1);
        bobProof[0] = aliceLeaf;
    }

    function _burn(uint256 amount) internal {
        address funder = makeAddr("funder");
        vm.deal(funder, amount);
        vm.prank(funder);
        pool.burn{value: amount}(1, "genesis");
    }

    function _publish(bytes32 root, uint256 total) internal returns (uint256) {
        vm.prank(publisher);
        return pool.publish(root, total, keccak256("inputs"));
    }
}

contract BurnPoolDepositTest is PoolFixture {
    event Burned(address indexed from, uint256 amount, uint256 indexed campaignId, bytes32 memo);

    function test_BurnRecordsDeposit() public {
        vm.deal(alice, 5 ether);
        vm.expectEmit(address(pool));
        emit Burned(alice, 2 ether, 7, "campaign-7");
        vm.prank(alice);
        pool.burn{value: 2 ether}(7, "campaign-7");

        assertEq(pool.totalBurned(), 2 ether);
        assertEq(address(pool).balance, 2 ether);
    }

    function test_PlainTransferBurnsToCampaignZero() public {
        vm.deal(alice, 1 ether);
        vm.expectEmit(address(pool));
        emit Burned(alice, 1 ether, 0, bytes32(0));
        vm.prank(alice);
        (bool ok,) = address(pool).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(pool.totalBurned(), 1 ether);
    }

    function test_RevertWhen_BurnIsEmpty() public {
        vm.expectRevert(BurnPool.NothingBurned.selector);
        pool.burn(1, "");
    }
}

contract BurnPoolReleaseTest is PoolFixture {
    function test_ReleaseGrowsWithTimeAndCapsAtBalance() public {
        _burn(100 ether);
        assertEq(pool.releasable(), 0);

        vm.warp(block.timestamp + 1 days);
        assertEq(pool.releasable(), 2 ether);

        vm.warp(block.timestamp + 1000 days);
        assertEq(pool.releasable(), 100 ether);
    }

    function test_RevertWhen_PublishAboveRelease() public {
        _burn(100 ether);
        vm.warp(block.timestamp + 1 days);
        (bytes32 root,,) = _tree(1 ether, 1.5 ether);
        vm.prank(publisher);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.TotalAboveRelease.selector, 2 ether, 2.5 ether));
        pool.publish(root, 2.5 ether, bytes32(0));
    }

    function test_RevertWhen_NotPublisher() public {
        _burn(100 ether);
        vm.warp(block.timestamp + 1 days);
        (bytes32 root,,) = _tree(1 ether, 1 ether);
        vm.expectRevert(BurnPool.NotPublisher.selector);
        pool.publish(root, 2 ether, bytes32(0));
    }

    function test_RevertWhen_PreviousSettlementPending() public {
        _burn(100 ether);
        vm.warp(block.timestamp + 1 days);
        (bytes32 root,,) = _tree(0.5 ether, 0.5 ether);
        _publish(root, 1 ether);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(publisher);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.SettlementPending.selector, 1));
        pool.publish(root, 1 ether, bytes32(0));
    }

    function test_RevertWhen_TotalDecreases() public {
        _burn(100 ether);
        vm.warp(block.timestamp + 1 days);
        (bytes32 root,,) = _tree(1 ether, 1 ether);
        _publish(root, 2 ether);

        vm.warp(block.timestamp + CHALLENGE);
        (bytes32 lower,,) = _tree(0.5 ether, 0.5 ether);
        vm.prank(publisher);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.TotalDecreased.selector, 2 ether, 1 ether));
        pool.publish(lower, 1 ether, bytes32(0));
    }
}

contract BurnPoolClaimTest is PoolFixture {
    bytes32 internal root;
    bytes32[] internal aliceProof;
    bytes32[] internal bobProof;

    function setUp() public override {
        super.setUp();
        _burn(100 ether);
        vm.warp(block.timestamp + 1 days);
        (root, aliceProof, bobProof) = _tree(1.25 ether, 0.75 ether);
        _publish(root, 2 ether);
    }

    function test_RevertWhen_ClaimBeforeChallengeDelay() public {
        vm.expectRevert(
            abi.encodeWithSelector(BurnPool.NotYetClaimable.selector, 1, uint64(block.timestamp + CHALLENGE))
        );
        pool.claim(1, alice, 1.25 ether, aliceProof);
    }

    function test_ClaimPaysTheAccountWhoeverCalls() public {
        vm.warp(block.timestamp + CHALLENGE);
        vm.prank(bob);
        pool.claim(1, alice, 1.25 ether, aliceProof);

        assertEq(alice.balance, 1.25 ether);
        assertEq(pool.claimed(alice), 1.25 ether);
        assertEq(pool.totalClaimed(), 1.25 ether);
        assertEq(address(pool).balance, 100 ether - 1.25 ether);
    }

    function test_RevertWhen_ClaimTwice() public {
        vm.warp(block.timestamp + CHALLENGE);
        pool.claim(1, alice, 1.25 ether, aliceProof);
        vm.expectRevert(BurnPool.NothingToClaim.selector);
        pool.claim(1, alice, 1.25 ether, aliceProof);
    }

    function test_RevertWhen_ProofIsForAnotherAmount() public {
        vm.warp(block.timestamp + CHALLENGE);
        vm.expectRevert(BurnPool.InvalidProof.selector);
        pool.claim(1, alice, 2 ether, aliceProof);
    }

    function test_LaterSettlementPaysOnlyTheDifference() public {
        vm.warp(block.timestamp + CHALLENGE);
        pool.claim(1, alice, 1.25 ether, aliceProof);

        vm.warp(block.timestamp + 1 days);
        (bytes32 next, bytes32[] memory nextAlice,) = _tree(2 ether, 1 ether);
        _publish(next, 3 ether);
        vm.warp(block.timestamp + CHALLENGE);

        pool.claim(2, alice, 2 ether, nextAlice);
        assertEq(alice.balance, 2 ether);
        assertEq(pool.claimed(alice), 2 ether);
    }

    function test_VetoRestoresHeadAndReleaseBudget() public {
        uint256 budgetBefore = pool.releasable();
        vm.prank(guardian);
        pool.veto(1);

        assertEq(pool.head(), 0);
        assertEq(pool.committed(), 0);
        assertGe(pool.releasable(), budgetBefore);

        vm.warp(block.timestamp + CHALLENGE);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.Vetoed.selector, 1));
        pool.claim(1, alice, 1.25 ether, aliceProof);
    }

    function test_PublishAgainAfterVeto() public {
        vm.prank(guardian);
        pool.veto(1);
        (bytes32 fixedRoot,,) = _tree(1 ether, 1 ether);
        assertEq(_publish(fixedRoot, 2 ether), 2);
        assertEq(pool.head(), 2);
    }

    function test_RevertWhen_VetoAfterFinal() public {
        vm.warp(block.timestamp + CHALLENGE);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.SettlementFinal.selector, 1));
        pool.veto(1);
    }

    function test_RevertWhen_NonGuardianVetoes() public {
        vm.prank(publisher);
        vm.expectRevert(BurnPool.NotGuardian.selector);
        pool.veto(1);
    }

    function test_ClaimsNeverExceedTheSettlementTotal() public {
        vm.prank(guardian);
        pool.veto(1);
        vm.warp(block.timestamp + 1 days);
        (bytes32 greedy, bytes32[] memory greedyAlice, bytes32[] memory greedyBob) = _tree(3 ether, 3 ether);
        _publish(greedy, 4 ether);
        vm.warp(block.timestamp + CHALLENGE);

        pool.claim(2, alice, 3 ether, greedyAlice);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.AboveSettlementTotal.selector, 4 ether, 6 ether));
        pool.claim(2, bob, 3 ether, greedyBob);
    }
}

contract BurnPoolZapTest is PoolFixture {
    RecordingZap internal zap;
    bytes32[] internal aliceProof;

    function setUp() public override {
        super.setUp();
        zap = new RecordingZap();
        _burn(100 ether);
        vm.warp(block.timestamp + 1 days);
        bytes32 root;
        (root, aliceProof,) = _tree(1 ether, 1 ether);
        _publish(root, 2 ether);
        vm.prank(guardian);
        pool.allowZap(address(zap));
    }

    function test_RevertWhen_ZapNotYetEnabled() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.ZapNotAllowed.selector, address(zap)));
        pool.claimVia(1, 1 ether, aliceProof, address(zap), "");
    }

    function test_ClaimViaDeliversThroughTheZap() public {
        vm.warp(block.timestamp + CHALLENGE);
        vm.prank(alice);
        pool.claimVia(1, 1 ether, aliceProof, address(zap), "");

        assertEq(zap.lastAccount(), alice);
        assertEq(zap.lastValue(), 1 ether);
        assertEq(address(zap).balance, 1 ether);
        assertEq(pool.claimed(alice), 1 ether);
    }

    function test_RevertWhen_SomeoneElseUsesTheZap() public {
        vm.warp(block.timestamp + CHALLENGE);
        vm.prank(bob);
        vm.expectRevert(BurnPool.InvalidProof.selector);
        pool.claimVia(1, 1 ether, aliceProof, address(zap), "");
    }

    function test_RevertWhen_ZapDisabled() public {
        vm.warp(block.timestamp + CHALLENGE);
        vm.prank(guardian);
        pool.disallowZap(address(zap));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.ZapNotAllowed.selector, address(zap)));
        pool.claimVia(1, 1 ether, aliceProof, address(zap), "");
    }

    function test_RevertWhen_ZapIsNotAContract() public {
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(BurnPool.NotAContract.selector, alice));
        pool.allowZap(alice);
    }
}

contract BurnPoolRotationTest is PoolFixture {
    function test_PublisherRotationWaitsForItsDelay() public {
        address next = makeAddr("next");
        vm.prank(guardian);
        pool.proposePublisher(next);

        vm.expectRevert(abi.encodeWithSelector(BurnPool.RotationNotReady.selector, uint64(block.timestamp + ROTATION)));
        pool.applyPublisher();

        vm.warp(block.timestamp + ROTATION);
        pool.applyPublisher();
        assertEq(pool.publisher(), next);
        assertEq(pool.nextPublisher(), address(0));
    }

    function test_RevertWhen_NoRotationPending() public {
        vm.expectRevert(BurnPool.NoPendingPublisher.selector);
        pool.applyPublisher();
    }
}

contract BurnPoolFuzzTest is PoolFixture {
    function testFuzz_ReleasableNeverExceedsWhatWasBurned(uint96 deposit, uint32 elapsed) public {
        vm.assume(deposit > 0);
        _burn(deposit);
        vm.warp(block.timestamp + elapsed);
        assertLe(pool.releasable(), pool.totalBurned());
    }

    function testFuzz_OneDayReleasesTheConfiguredShare(uint96 deposit) public {
        vm.assume(deposit > 0);
        _burn(deposit);
        vm.warp(block.timestamp + 1 days);
        assertEq(pool.releasable(), uint256(deposit) * RELEASE_BPS / 10_000);
    }
}

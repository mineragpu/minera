// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BurnPool} from "../src/BurnPool.sol";

contract BurnPoolHandler is Test {
    BurnPool internal immutable pool;
    address internal immutable guardian;
    address internal immutable publisher;
    address internal immutable alice;
    address internal immutable bob;

    struct Entitlement {
        uint256 alice;
        uint256 bob;
    }

    mapping(uint256 index => Entitlement) internal entitlements;

    constructor(BurnPool pool_, address guardian_, address publisher_, address alice_, address bob_) {
        pool = pool_;
        guardian = guardian_;
        publisher = publisher_;
        alice = alice_;
        bob = bob_;
    }

    function burn(uint96 amount) external {
        amount = uint96(bound(amount, 1, 1_000 ether));
        vm.deal(address(this), amount);
        pool.burn{value: amount}(1, "");
    }

    function wait(uint32 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1 minutes, 3 days));
    }

    function publish(uint96 toAlice, uint96 toBob) external {
        uint256 latest = pool.settlementCount();
        if (latest != 0) {
            (,,, uint64 claimableAt, bool vetoed,) = pool.settlements(latest);
            if (!vetoed && block.timestamp < claimableAt) return;
        }
        Entitlement memory base = entitlements[pool.head()];
        uint256 room = pool.releasable() - pool.committed();
        uint256 addAlice = bound(toAlice, 0, room);
        uint256 addBob = bound(toBob, 0, room - addAlice);
        Entitlement memory next = Entitlement(base.alice + addAlice, base.bob + addBob);
        if (next.alice == 0 || next.bob == 0) return;

        vm.prank(publisher);
        uint256 index = pool.publish(_root(next), next.alice + next.bob, bytes32(0));
        entitlements[index] = next;
    }

    function veto() external {
        uint256 latest = pool.settlementCount();
        if (latest == 0) return;
        (,,, uint64 claimableAt, bool vetoed,) = pool.settlements(latest);
        if (vetoed || block.timestamp >= claimableAt) return;
        vm.prank(guardian);
        pool.veto(latest);
    }

    function claim(bool forAlice) external {
        uint256 index = _latestFinal();
        if (index == 0) return;
        Entitlement memory e = entitlements[index];
        address account = forAlice ? alice : bob;
        uint256 cumulative = forAlice ? e.alice : e.bob;
        if (cumulative <= pool.claimed(account)) return;
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = forAlice ? _leaf(bob, e.bob) : _leaf(alice, e.alice);
        pool.claim(index, account, cumulative, proof);
    }

    function _latestFinal() internal view returns (uint256 index) {
        index = pool.head();
        while (index != 0) {
            (,,, uint64 claimableAt, bool vetoed, uint256 previous) = pool.settlements(index);
            if (!vetoed && block.timestamp >= claimableAt) return index;
            index = previous;
        }
    }

    function _root(Entitlement memory e) internal view returns (bytes32) {
        bytes32 a = _leaf(alice, e.alice);
        bytes32 b = _leaf(bob, e.bob);
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _leaf(address account, uint256 cumulative) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, cumulative))));
    }
}

contract BurnPoolInvariantTest is Test {
    BurnPool internal pool;
    BurnPoolHandler internal handler;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        address guardian = makeAddr("guardian");
        address publisher = makeAddr("publisher");
        pool = new BurnPool(guardian, publisher, 12 hours, 2 days, 200);
        handler = new BurnPoolHandler(pool, guardian, publisher, alice, bob);
        targetContract(address(handler));
    }

    function invariant_BalanceIsBurnedMinusClaimed() public view {
        assertEq(address(pool).balance, pool.totalBurned() - pool.totalClaimed());
    }

    function invariant_ClaimsNeverExceedCommitted() public view {
        assertLe(pool.totalClaimed(), pool.committed());
    }

    function invariant_CommittedNeverExceedsBurned() public view {
        assertLe(pool.committed(), pool.totalBurned());
    }

    function invariant_ReleasableNeverExceedsBurned() public view {
        assertLe(pool.releasable(), pool.totalBurned());
    }

    function invariant_ClaimantsReceivedExactlyWhatTheyClaimed() public view {
        assertEq(alice.balance + bob.balance, pool.totalClaimed());
    }
}

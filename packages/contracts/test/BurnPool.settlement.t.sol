// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BurnPool} from "../src/BurnPool.sol";

/// @notice Claims every entry of a settlement built by the coordinator's TypeScript code, proving
/// the off-chain tree format matches what the pool verifies.
contract BurnPoolSettlementFixtureTest is Test {
    function test_CoordinatorSettlementVerifiesOnChain() public {
        string memory json = vm.readFile("test/fixtures/settlement.json");
        bytes32 root = vm.parseJsonBytes32(json, ".root");
        uint256 total = vm.parseJsonUint(json, ".total");
        uint256 count = vm.parseJsonUint(json, ".count");

        BurnPool pool = new BurnPool(makeAddr("guardian"), address(this), 12 hours, 2 days, 10_000);
        vm.deal(address(this), total);
        pool.burn{value: total}(1, "fixture");
        vm.warp(block.timestamp + 1 days);
        pool.publish(root, total, bytes32(0));
        vm.warp(block.timestamp + 12 hours);

        for (uint256 i = 0; i < count; i++) {
            string memory entry = string.concat(".entries[", vm.toString(i), "]");
            address account = vm.parseJsonAddress(json, string.concat(entry, ".account"));
            uint256 cumulative = vm.parseJsonUint(json, string.concat(entry, ".cumulative"));
            bytes32[] memory proof = vm.parseJsonBytes32Array(json, string.concat(entry, ".proof"));

            pool.claim(1, account, cumulative, proof);
            assertEq(account.balance, cumulative);
        }
        assertEq(pool.totalClaimed(), total);
        assertEq(address(pool).balance, 0);
    }
}

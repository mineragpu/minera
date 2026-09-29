// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PairZap} from "../src/PairZap.sol";

/// @notice Runs PairZap against the live testnet router, registry and stock pools.
/// Set TESTNET_RPC_URL to enable it; without it the tests are skipped.
contract PairZapTestnetForkTest is Test {
    address internal constant ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904;
    address internal constant REGISTRY = 0x1dF3cA0fD30ED5eeb09eB01938f4E9c5196E6Ca5;
    address internal constant AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address internal constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;

    PairZap internal zap;
    address internal miner = makeAddr("miner");

    function setUp() public {
        string memory rpc = vm.envOr("TESTNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        PairZap.Route[] memory routes = new PairZap.Route[](2);
        routes[0] = PairZap.Route({asset: AMZN, fee: 100, tickSpacing: 1});
        routes[1] = PairZap.Route({asset: TSLA, fee: 500, tickSpacing: 10});
        zap = new PairZap(ROUTER, REGISTRY, routes);
        vm.deal(address(this), 1 ether);
    }

    function test_SwapsEthIntoEachTestnetStock() public {
        zap.deliver{value: 0.0001 ether}(miner, abi.encode(AMZN, 1, block.timestamp + 10 minutes));
        assertGt(IERC20(AMZN).balanceOf(miner), 0);

        zap.deliver{value: 0.0001 ether}(miner, abi.encode(TSLA, 1, block.timestamp + 10 minutes));
        assertGt(IERC20(TSLA).balanceOf(miner), 0);

        assertEq(IERC20(AMZN).balanceOf(address(zap)), 0);
        assertEq(IERC20(TSLA).balanceOf(address(zap)), 0);
        assertEq(address(zap).balance, 0);
    }

    function test_RevertWhen_MinimumCannotBeMet() public {
        vm.expectRevert();
        zap.deliver{value: 0.0001 ether}(miner, abi.encode(AMZN, type(uint128).max, block.timestamp + 10 minutes));
    }
}

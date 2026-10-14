// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DeployZap} from "../script/DeployZap.s.sol";
import {PairZap} from "../src/PairZap.sol";
import {IStockRegistry} from "../src/interfaces/IStockRegistry.sol";

/// @notice Runs a pair zap built from `deploy/mainnet-zap.json` against the live mainnet router,
/// stock registry and pools, so every route is proven to deliver before the zap is deployed.
/// Set MAINNET_RPC_URL to enable it; without it the tests are skipped.
contract PairZapMainnetForkTest is Test {
    address internal constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;

    DeployZap.ZapConfig internal config;
    PairZap internal zap;
    address internal miner = makeAddr("miner");

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        DeployZap script = new DeployZap();
        DeployZap.ZapConfig memory loaded = script.configFrom(vm.readFile("deploy/mainnet-zap.json"));
        config.chainId = loaded.chainId;
        config.router = loaded.router;
        config.stockRegistry = loaded.stockRegistry;
        for (uint256 i = 0; i < loaded.routes.length; i++) {
            config.routes.push(loaded.routes[i]);
        }
        script.check(config);
        zap = new PairZap(config.router, config.stockRegistry, config.routes);
        vm.deal(address(this), 1 ether);
    }

    function test_ConfigIsForMainnet() public view {
        assertEq(block.chainid, 4663);
        assertEq(config.chainId, 4663);
        assertFalse(IStockRegistry(config.stockRegistry).paused());
    }

    function test_EveryRouteDeliversItsStock() public {
        for (uint256 i = 0; i < config.routes.length; i++) {
            address asset = config.routes[i].asset;
            uint256 before = IERC20(asset).balanceOf(miner);
            zap.deliver{value: 0.01 ether}(miner, abi.encode(asset, 1, block.timestamp + 10 minutes));
            assertGt(IERC20(asset).balanceOf(miner), before);
            assertEq(IERC20(asset).balanceOf(address(zap)), 0);
        }
        assertEq(address(zap).balance, 0);
    }

    function test_RevertWhen_AStockHasNoRoute() public {
        vm.expectRevert(abi.encodeWithSelector(PairZap.UnknownPair.selector, TSLA));
        zap.deliver{value: 0.01 ether}(miner, abi.encode(TSLA, 1, block.timestamp + 10 minutes));
    }

    function test_RevertWhen_MinimumCannotBeMet() public {
        address asset = config.routes[0].asset;
        vm.expectRevert();
        zap.deliver{value: 0.01 ether}(miner, abi.encode(asset, type(uint128).max, block.timestamp + 10 minutes));
    }
}

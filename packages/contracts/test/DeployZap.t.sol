// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployZap} from "../script/DeployZap.s.sol";
import {PairZap} from "../src/PairZap.sol";
import {MockStock} from "./mocks/MockStock.sol";
import {MockStockRegistry} from "./mocks/MockStockRegistry.sol";
import {MockUniversalRouter} from "./mocks/MockUniversalRouter.sol";

/// @notice The zap deploy script reads the routes from its config and refuses a zap that could not
/// deliver.
contract DeployZapTest is Test {
    DeployZap internal script;
    DeployZap.ZapConfig internal config;

    function setUp() public {
        script = new DeployZap();
        config.chainId = 4663;
        config.router = address(new MockUniversalRouter());
        config.stockRegistry = address(new MockStockRegistry());
        config.routes.push(PairZap.Route({asset: address(new MockStock()), fee: 500, tickSpacing: 10}));
    }

    function _expectUnsafe(string memory reason) internal {
        vm.expectRevert(abi.encodeWithSelector(DeployZap.UnsafeConfig.selector, reason));
        script.check(config);
    }

    function test_MainnetConfigReadsTheFourRoutes() public view {
        DeployZap.ZapConfig memory mainnet = script.configFrom(vm.readFile("deploy/mainnet-zap.json"));
        assertEq(mainnet.chainId, 4663);
        assertEq(mainnet.router, 0x8876789976dEcBfCbBbe364623C63652db8C0904);
        assertEq(mainnet.stockRegistry, 0xe10b6f6B275de231345c20D14Ab812db62151b00);
        assertEq(mainnet.routes.length, 4);
        assertEq(mainnet.routes[0].asset, 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC);
        assertEq(mainnet.routes[0].fee, 500);
        assertEq(mainnet.routes[0].tickSpacing, 10);
        assertEq(mainnet.routes[3].asset, 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C);
        assertEq(mainnet.routes[3].fee, 10000);
        assertEq(mainnet.routes[3].tickSpacing, 200);
    }

    function test_ValidConfigPasses() public view {
        script.check(config);
    }

    function test_RevertWhen_RouterHasNoCode() public {
        config.router = makeAddr("no router");
        _expectUnsafe("router has no code");
    }

    function test_RevertWhen_RegistryHasNoCode() public {
        config.stockRegistry = makeAddr("no registry");
        _expectUnsafe("stockRegistry has no code");
    }

    function test_RevertWhen_ThereAreNoRoutes() public {
        delete config.routes;
        _expectUnsafe("no routes");
    }

    function test_RevertWhen_AnAssetHasNoCode() public {
        config.routes[0].asset = makeAddr("no stock");
        _expectUnsafe("a route asset has no code");
    }

    function test_RevertWhen_AFeeIsZero() public {
        config.routes[0].fee = 0;
        _expectUnsafe("a route fee is out of range");
    }

    function test_RevertWhen_ATickSpacingIsNotPositive() public {
        config.routes[0].tickSpacing = 0;
        _expectUnsafe("a route tick spacing is not positive");
    }
}

// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BurnPool} from "../src/BurnPool.sol";
import {PairZap} from "../src/PairZap.sol";
import {MockStock} from "./mocks/MockStock.sol";
import {MockStockRegistry} from "./mocks/MockStockRegistry.sol";
import {MockUniversalRouter} from "./mocks/MockUniversalRouter.sol";

contract PairZapTest is Test {
    event Delivered(address indexed account, address indexed asset, uint256 ethIn, uint256 assetOut);

    MockStock internal stock;
    MockStockRegistry internal registry;
    MockUniversalRouter internal router;
    PairZap internal zap;
    address internal miner = makeAddr("miner");

    function setUp() public {
        stock = new MockStock();
        registry = new MockStockRegistry();
        router = new MockUniversalRouter();
        PairZap.Route[] memory routes = new PairZap.Route[](1);
        routes[0] = PairZap.Route({asset: address(stock), fee: 100, tickSpacing: 1});
        zap = new PairZap(address(router), address(registry), routes);
        vm.deal(address(this), 10 ether);
    }

    function _data(address asset, uint256 minOut) internal view returns (bytes memory) {
        return abi.encode(asset, minOut, block.timestamp + 10 minutes);
    }

    function test_DeliversTheStockToTheAccount() public {
        vm.expectEmit(address(zap));
        emit Delivered(miner, address(stock), 1 ether, 50 ether);
        zap.deliver{value: 1 ether}(miner, _data(address(stock), 49 ether));

        assertEq(stock.balanceOf(miner), 50 ether);
        assertEq(stock.balanceOf(address(zap)), 0);
        assertEq(address(zap).balance, 0);
    }

    function test_RevertWhen_PairIsUnknown() public {
        address unknown = makeAddr("unknown");
        vm.expectRevert(abi.encodeWithSelector(PairZap.UnknownPair.selector, unknown));
        zap.deliver{value: 1 ether}(miner, _data(unknown, 0));
    }

    function test_RevertWhen_Expired() public {
        vm.warp(1_000);
        uint256 deadline = 999;
        vm.expectRevert(abi.encodeWithSelector(PairZap.Expired.selector, deadline));
        zap.deliver{value: 1 ether}(miner, abi.encode(address(stock), 0, deadline));
    }

    function test_RevertWhen_RecipientIsBlocked() public {
        registry.setBlocked(miner, true);
        vm.expectRevert(abi.encodeWithSelector(PairZap.RecipientBlocked.selector, miner));
        zap.deliver{value: 1 ether}(miner, _data(address(stock), 0));
    }

    function test_RevertWhen_MarketIsPaused() public {
        registry.setPaused(true);
        vm.expectRevert(PairZap.MarketPaused.selector);
        zap.deliver{value: 1 ether}(miner, _data(address(stock), 0));
    }

    function test_RevertWhen_OutputBelowMinimumEvenIfTheRouterDoesNotCheck() public {
        router.setEnforceMinimum(false);
        router.setRate(10);
        vm.expectRevert(abi.encodeWithSelector(PairZap.InsufficientOutput.selector, 10 ether, 20 ether));
        zap.deliver{value: 1 ether}(miner, _data(address(stock), 20 ether));
    }

    function test_RevertWhen_RoutesRepeatAnAsset() public {
        PairZap.Route[] memory routes = new PairZap.Route[](2);
        routes[0] = PairZap.Route({asset: address(stock), fee: 100, tickSpacing: 1});
        routes[1] = PairZap.Route({asset: address(stock), fee: 500, tickSpacing: 10});
        vm.expectRevert(abi.encodeWithSelector(PairZap.DuplicateRoute.selector, address(stock)));
        new PairZap(address(router), address(registry), routes);
    }

    function test_RevertWhen_ConstructedWithoutRouterOrRegistry() public {
        PairZap.Route[] memory none = new PairZap.Route[](0);
        vm.expectRevert(PairZap.ZeroAddress.selector);
        new PairZap(address(0), address(registry), none);
        vm.expectRevert(PairZap.ZeroAddress.selector);
        new PairZap(address(router), address(0), none);
    }

    function test_RevertWhen_ARouteHasNoAsset() public {
        PairZap.Route[] memory routes = new PairZap.Route[](1);
        routes[0] = PairZap.Route({asset: address(0), fee: 100, tickSpacing: 1});
        vm.expectRevert(PairZap.ZeroAddress.selector);
        new PairZap(address(router), address(registry), routes);
    }

    function test_RevertWhen_MinimumDoesNotFitTheSwap() public {
        uint256 tooLarge = uint256(type(uint128).max) + 1;
        vm.expectRevert(PairZap.AmountTooLarge.selector);
        zap.deliver{value: 1 ether}(miner, _data(address(stock), tooLarge));

        vm.deal(address(this), tooLarge);
        vm.expectRevert(PairZap.AmountTooLarge.selector);
        zap.deliver{value: tooLarge}(miner, _data(address(stock), 0));
    }

    function test_ExposesItsFixedRoutes() public view {
        PairZap.Route memory route = zap.routeOf(address(stock));
        assertEq(route.asset, address(stock));
        assertEq(route.fee, 100);
        assertEq(route.tickSpacing, 1);
        assertEq(zap.listedAssets().length, 1);
    }

    function test_BurnPoolClaimArrivesAsTheStock() public {
        address guardian = makeAddr("guardian");
        BurnPool pool = new BurnPool(guardian, address(this), 1 hours, 1 days, 10_000);
        pool.burn{value: 2 ether}(1, "");
        vm.warp(block.timestamp + 1 days);

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(miner, 1 ether))));
        pool.publish(leaf, 1 ether, bytes32(0));
        vm.prank(guardian);
        pool.allowZap(address(zap));
        vm.warp(block.timestamp + 1 hours);

        vm.prank(miner);
        pool.claimVia(1, 1 ether, new bytes32[](0), address(zap), _data(address(stock), 1));

        assertEq(stock.balanceOf(miner), 50 ether);
        assertEq(miner.balance, 0);
        assertEq(pool.claimed(miner), 1 ether);
    }
}

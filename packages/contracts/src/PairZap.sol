// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPairZap} from "./interfaces/IPairZap.sol";
import {IStockRegistry} from "./interfaces/IStockRegistry.sol";
import {IUniversalRouter} from "./interfaces/IUniversalRouter.sol";

/// @title PairZap
/// @notice Converts a Burn Pool claim from ETH into the stock token a rig is paired with and
/// delivers it to the claimant.
/// @dev Routes are fixed at deployment: each asset maps to one hookless native-ETH Uniswap v4
/// pool, so nobody can redirect a conversion later. A new route means a new zap, which the pool
/// only accepts after its public delay. The issuer registry is checked first so a blocked
/// recipient or a paused market fails with a clear reason instead of stranding the claim.
contract PairZap is IPairZap {
    using SafeERC20 for IERC20;

    struct Route {
        address asset;
        uint24 fee;
        int24 tickSpacing;
    }

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    uint8 private constant V4_SWAP = 0x10;
    uint8 private constant SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 private constant SETTLE_ALL = 0x0c;
    uint8 private constant TAKE_ALL = 0x0f;

    IUniversalRouter public immutable router;
    IStockRegistry public immutable registry;

    mapping(address asset => Route) private routes;
    address[] private assets;

    event Delivered(address indexed account, address indexed asset, uint256 ethIn, uint256 assetOut);

    error ZeroAddress();
    error DuplicateRoute(address asset);
    error UnknownPair(address asset);
    error Expired(uint256 deadline);
    error RecipientBlocked(address account);
    error MarketPaused();
    error AmountTooLarge();
    error InsufficientOutput(uint256 received, uint256 minimum);

    constructor(address router_, address registry_, Route[] memory routes_) {
        if (router_ == address(0) || registry_ == address(0)) revert ZeroAddress();
        router = IUniversalRouter(router_);
        registry = IStockRegistry(registry_);
        for (uint256 i = 0; i < routes_.length; i++) {
            Route memory route = routes_[i];
            if (route.asset == address(0)) revert ZeroAddress();
            if (routes[route.asset].asset != address(0)) revert DuplicateRoute(route.asset);
            routes[route.asset] = route;
            assets.push(route.asset);
        }
    }

    /// @param data `abi.encode(asset, minOut, deadline)`, chosen by the claimant.
    function deliver(address account, bytes calldata data) external payable {
        (address asset, uint256 minOut, uint256 deadline) = abi.decode(data, (address, uint256, uint256));
        Route memory route = routes[asset];
        if (route.asset == address(0)) revert UnknownPair(asset);
        if (block.timestamp > deadline) revert Expired(deadline);
        if (msg.value > type(uint128).max || minOut > type(uint128).max) revert AmountTooLarge();
        if (registry.paused()) revert MarketPaused();
        if (registry.isBlocked(account)) revert RecipientBlocked(account);

        IERC20 token = IERC20(asset);
        uint256 before = token.balanceOf(address(this));
        router.execute{value: msg.value}(abi.encodePacked(V4_SWAP), _swapInputs(route, msg.value, minOut), deadline);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received < minOut) revert InsufficientOutput(received, minOut);

        emit Delivered(account, asset, msg.value, received);
        token.safeTransfer(account, received);
    }

    function routeOf(address asset) external view returns (Route memory) {
        return routes[asset];
    }

    function listedAssets() external view returns (address[] memory) {
        return assets;
    }

    function _swapInputs(Route memory route, uint256 amountIn, uint256 minOut)
        private
        pure
        returns (bytes[] memory inputs)
    {
        PoolKey memory key = PoolKey({
            currency0: address(0),
            currency1: route.asset,
            fee: route.fee,
            tickSpacing: route.tickSpacing,
            hooks: address(0)
        });
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            ExactInputSingleParams({
                poolKey: key,
                zeroForOne: true,
                amountIn: uint128(amountIn),
                amountOutMinimum: uint128(minOut),
                hookData: ""
            })
        );
        params[1] = abi.encode(address(0), amountIn);
        params[2] = abi.encode(route.asset, minOut);

        inputs = new bytes[](1);
        inputs[0] = abi.encode(abi.encodePacked(SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL), params);
    }
}

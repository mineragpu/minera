// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

/// @notice The subset of the Uniswap Universal Router that PairZap calls.
interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

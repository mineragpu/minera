// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @notice Converts a claim's ETH into the account's paired asset and delivers it.
/// @dev Must deliver to `account` or revert, so a failed conversion never loses the claim.
interface IPairZap {
    function deliver(address account, bytes calldata data) external payable;
}

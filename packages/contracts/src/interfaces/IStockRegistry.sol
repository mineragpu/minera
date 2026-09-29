// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

/// @notice The issuer registry shared by the chain's stock tokens: a blocklist and a global pause.
interface IStockRegistry {
    function isBlocked(address account) external view returns (bool);

    function paused() external view returns (bool);
}

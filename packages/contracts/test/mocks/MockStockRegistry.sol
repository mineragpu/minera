// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {IStockRegistry} from "../../src/interfaces/IStockRegistry.sol";

contract MockStockRegistry is IStockRegistry {
    mapping(address account => bool) public isBlocked;
    bool public paused;

    function setBlocked(address account, bool blocked) external {
        isBlocked[account] = blocked;
    }

    function setPaused(bool value) external {
        paused = value;
    }
}

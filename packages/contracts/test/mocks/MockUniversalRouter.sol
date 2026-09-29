// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {IUniversalRouter} from "../../src/interfaces/IUniversalRouter.sol";
import {PairZap} from "../../src/PairZap.sol";
import {MockStock} from "./MockStock.sol";

/// @notice Checks the exact v4 command layout PairZap sends, then pays out `rate` stock units per
/// wei of ETH to the caller.
contract MockUniversalRouter is IUniversalRouter {
    uint256 public rate = 50;
    bool public enforceMinimum = true;

    error BadCommands();
    error BadActions();
    error BadSettle();
    error MinimumNotMet();

    function setRate(uint256 value) external {
        rate = value;
    }

    function setEnforceMinimum(bool value) external {
        enforceMinimum = value;
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256) external payable {
        if (commands.length != 1 || uint8(commands[0]) != 0x10 || inputs.length != 1) revert BadCommands();
        (bytes memory actions, bytes[] memory params) = abi.decode(inputs[0], (bytes, bytes[]));
        if (keccak256(actions) != keccak256(hex"060c0f") || params.length != 3) revert BadActions();

        PairZap.ExactInputSingleParams memory swap = abi.decode(params[0], (PairZap.ExactInputSingleParams));
        (address settleCurrency, uint256 settleAmount) = abi.decode(params[1], (address, uint256));
        if (settleCurrency != address(0) || settleAmount != msg.value || swap.amountIn != msg.value) {
            revert BadSettle();
        }

        uint256 out = msg.value * rate;
        if (enforceMinimum && out < swap.amountOutMinimum) revert MinimumNotMet();
        MockStock(swap.poolKey.currency1).mint(msg.sender, out);
    }
}

// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

/// @notice The part of the rig registry the bond reads.
interface IRigRegistry {
    function rigs(address nodeKey)
        external
        view
        returns (address operator, address pair, uint64 deployedAt, bool retired);
}

/// @notice The part of the Burn Pool the bond pays slashed ETH into.
interface IBurnPool {
    function burn(uint256 campaignId, bytes32 memo) external payable;
}

/// @title RigBond
/// @notice A work bond: ETH a rig's operator locks to stand behind its rig. The coordinator pays open
/// work only to bonded rigs, so every extra rig an operator runs costs a bond, and a rig caught
/// cheating can lose it.
/// @dev Leaving takes an unbonding delay. During it the rig no longer counts as bonded and the
/// guardian can still slash it, so a rig cannot cheat and withdraw before the evidence is in.
/// Slashed ETH never goes to the guardian: it is burned into the Burn Pool, where it pays honest
/// rigs. The contract has no owner, no upgrade path and no other way to move ETH.
contract RigBond {
    struct Bond {
        uint256 amount;
        /// @dev Zero while the bond is active; otherwise when it can be withdrawn.
        uint64 unlockAt;
    }

    IRigRegistry public immutable registry;
    IBurnPool public immutable burnPool;
    address public immutable guardian;
    /// @notice The least a rig must hold to count as bonded, in wei.
    uint256 public immutable minBond;
    /// @notice How long a bond stays slashable after its operator asks for it back.
    uint64 public immutable unbondDelay;
    /// @notice The Burn Pool campaign slashed ETH is burned under.
    uint256 public immutable slashCampaign;

    mapping(address nodeKey => Bond) public bonds;
    uint256 private locked = 1;

    event Bonded(address indexed nodeKey, address indexed operator, uint256 amount, uint256 total);
    event UnbondRequested(address indexed nodeKey, uint64 unlockAt);
    event Withdrawn(address indexed nodeKey, address indexed operator, uint256 amount);
    event Slashed(address indexed nodeKey, uint256 amount, bytes32 reason);

    error ZeroAddress();
    error NotAContract(address target);
    error NotGuardian();
    error NotOperator(address nodeKey);
    error UnknownRig(address nodeKey);
    error RigIsRetired(address nodeKey);
    error NothingBonded(address nodeKey);
    error NoBondSent();
    error NotUnbonding(address nodeKey);
    error StillLocked(address nodeKey, uint64 unlockAt);
    error SlashAboveBond(address nodeKey, uint256 bonded, uint256 amount);
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(
        address registry_,
        address burnPool_,
        address guardian_,
        uint256 minBond_,
        uint64 unbondDelay_,
        uint256 slashCampaign_
    ) {
        if (guardian_ == address(0)) revert ZeroAddress();
        if (registry_.code.length == 0) revert NotAContract(registry_);
        if (burnPool_.code.length == 0) revert NotAContract(burnPool_);
        registry = IRigRegistry(registry_);
        burnPool = IBurnPool(burnPool_);
        guardian = guardian_;
        minBond = minBond_;
        unbondDelay = unbondDelay_;
        slashCampaign = slashCampaign_;
    }

    /// @notice Add ETH to a rig's bond. Only the rig's operator can, and adding cancels a pending
    /// unbond, so the whole bond is active again.
    function bond(address nodeKey) external payable {
        if (msg.value == 0) revert NoBondSent();
        _requireOperator(nodeKey, true);
        Bond storage held = bonds[nodeKey];
        held.amount += msg.value;
        held.unlockAt = 0;
        emit Bonded(nodeKey, msg.sender, msg.value, held.amount);
    }

    /// @notice Ask for a rig's bond back. It stops counting as bonded at once and can be withdrawn
    /// after the unbonding delay. Allowed for a retired rig, so a bond is never stuck.
    function requestUnbond(address nodeKey) external {
        _requireOperator(nodeKey, false);
        Bond storage held = bonds[nodeKey];
        if (held.amount == 0) revert NothingBonded(nodeKey);
        uint64 unlockAt = uint64(block.timestamp) + unbondDelay;
        held.unlockAt = unlockAt;
        emit UnbondRequested(nodeKey, unlockAt);
    }

    /// @notice Withdraw a bond once its unbonding delay has passed. The ETH goes to the operator.
    function withdraw(address nodeKey) external nonReentrant {
        _requireOperator(nodeKey, false);
        Bond storage held = bonds[nodeKey];
        uint256 amount = held.amount;
        if (amount == 0) revert NothingBonded(nodeKey);
        if (held.unlockAt == 0) revert NotUnbonding(nodeKey);
        if (block.timestamp < held.unlockAt) revert StillLocked(nodeKey, held.unlockAt);
        delete bonds[nodeKey];
        emit Withdrawn(nodeKey, msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Slash part or all of a rig's bond, active or unbonding. The ETH is burned into the
    /// Burn Pool under the slash campaign, with the reason as its memo.
    function slash(address nodeKey, uint256 amount, bytes32 reason) external nonReentrant {
        if (msg.sender != guardian) revert NotGuardian();
        Bond storage held = bonds[nodeKey];
        if (amount == 0 || amount > held.amount) revert SlashAboveBond(nodeKey, held.amount, amount);
        held.amount -= amount;
        emit Slashed(nodeKey, amount, reason);
        burnPool.burn{value: amount}(slashCampaign, reason);
    }

    /// @notice Whether a rig counts as bonded: its bond is at least the minimum and not unbonding.
    function isBonded(address nodeKey) external view returns (bool) {
        Bond storage held = bonds[nodeKey];
        return held.unlockAt == 0 && held.amount >= minBond && held.amount > 0;
    }

    function _requireOperator(address nodeKey, bool active) private view {
        (address operator,,, bool retired) = registry.rigs(nodeKey);
        if (operator == address(0)) revert UnknownRig(nodeKey);
        if (operator != msg.sender) revert NotOperator(nodeKey);
        if (active && retired) revert RigIsRetired(nodeKey);
    }
}

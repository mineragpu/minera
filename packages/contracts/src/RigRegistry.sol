// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title RigRegistry
/// @notice The launchpad: deploying a rig binds a GPU node's key to its operator's wallet and
/// records the asset the rig's rewards pair with.
/// @dev A rig is identified by its node key. Deploying requires a signature from that key, so a
/// node can only be registered by the wallet its owner authorized. ETH (address zero) is always
/// a valid pair; any other asset is listed by the guardian and usable only after a public delay.
contract RigRegistry {
    struct Rig {
        address operator;
        address pair;
        uint64 deployedAt;
        bool retired;
    }

    uint256 private constant MAX_NAME_BYTES = 32;

    address public immutable guardian;
    uint64 public immutable listingDelay;

    uint256 public rigCount;
    mapping(address nodeKey => Rig) public rigs;
    mapping(address asset => uint64 listedAt) public pairListedAt;

    event RigDeployed(address indexed nodeKey, address indexed operator, address indexed pair, string name);
    event PairChanged(address indexed nodeKey, address indexed pair);
    event RigRetired(address indexed nodeKey);
    event PairScheduled(address indexed asset, uint64 listedAt);
    event PairDelisted(address indexed asset);

    error NotGuardian();
    error NotOperator(address nodeKey);
    error AlreadyDeployed(address nodeKey);
    error UnknownRig(address nodeKey);
    error RigIsRetired(address nodeKey);
    error PairNotListed(address asset);
    error InvalidName();
    error InvalidAuthorization();
    error NotAContract(address asset);
    error ZeroAddress();

    modifier onlyOperator(address nodeKey) {
        Rig storage rig = rigs[nodeKey];
        if (rig.operator == address(0)) revert UnknownRig(nodeKey);
        if (rig.operator != msg.sender) revert NotOperator(nodeKey);
        if (rig.retired) revert RigIsRetired(nodeKey);
        _;
    }

    constructor(address guardian_, uint64 listingDelay_) {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        listingDelay = listingDelay_;
    }

    /// @notice Deploy a rig. `authorization` is the node key's signature over
    /// `deployDigest(msg.sender)`, produced by the node client.
    function deploy(address nodeKey, address pair, string calldata name, bytes calldata authorization) external {
        if (rigs[nodeKey].operator != address(0)) revert AlreadyDeployed(nodeKey);
        uint256 nameLength = bytes(name).length;
        if (nameLength == 0 || nameLength > MAX_NAME_BYTES) revert InvalidName();
        if (!isPairListed(pair)) revert PairNotListed(pair);

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(deployDigest(msg.sender));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, authorization);
        if (err != ECDSA.RecoverError.NoError || signer != nodeKey) revert InvalidAuthorization();

        rigs[nodeKey] = Rig({operator: msg.sender, pair: pair, deployedAt: uint64(block.timestamp), retired: false});
        rigCount += 1;
        emit RigDeployed(nodeKey, msg.sender, pair, name);
    }

    /// @notice Change the asset a rig's rewards pair with. It applies from the next settlement.
    function setPair(address nodeKey, address pair) external onlyOperator(nodeKey) {
        if (!isPairListed(pair)) revert PairNotListed(pair);
        rigs[nodeKey].pair = pair;
        emit PairChanged(nodeKey, pair);
    }

    /// @notice Permanently retire a rig. Its node key cannot be deployed again.
    function retire(address nodeKey) external onlyOperator(nodeKey) {
        rigs[nodeKey].retired = true;
        emit RigRetired(nodeKey);
    }

    /// @notice List a pair asset. It becomes usable after `listingDelay`.
    function listPair(address asset) external {
        if (msg.sender != guardian) revert NotGuardian();
        if (asset.code.length == 0) revert NotAContract(asset);
        uint64 listedAt = uint64(block.timestamp) + listingDelay;
        pairListedAt[asset] = listedAt;
        emit PairScheduled(asset, listedAt);
    }

    /// @notice Stop new deployments and changes to an asset. Rigs already paired keep it until
    /// their operator changes it.
    function delistPair(address asset) external {
        if (msg.sender != guardian) revert NotGuardian();
        delete pairListedAt[asset];
        emit PairDelisted(asset);
    }

    function isPairListed(address asset) public view returns (bool) {
        if (asset == address(0)) return true;
        uint64 listedAt = pairListedAt[asset];
        return listedAt != 0 && block.timestamp >= listedAt;
    }

    /// @notice The message a node key signs to authorize deployment by `operator` on this
    /// registry and chain.
    function deployDigest(address operator) public view returns (bytes32) {
        return keccak256(abi.encode("rig-deploy-v1", block.chainid, address(this), operator));
    }
}

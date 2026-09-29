// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IPairZap} from "./interfaces/IPairZap.sol";

/// @title BurnPool
/// @notice Holds the ETH that pays mining rewards. Deposits are one-way: no function in this
/// contract moves ETH out except a claim against a finalized settlement.
/// @dev A settlement commits cumulative per-account entitlements as a Merkle root. Three limits
/// bound what any settlement can release:
///  - its total may grow by at most `releaseBpsPerDay` of the uncommitted balance per day;
///  - it becomes claimable only after `challengeDelay`, during which the guardian may veto it;
///  - claims made under it can never sum past its total.
/// The guardian can veto and schedule roles, but it has no path to the funds.
contract BurnPool {
    struct Settlement {
        bytes32 root;
        uint256 total;
        uint64 publishedAt;
        uint64 claimableAt;
        bool vetoed;
        uint256 previous;
    }

    uint256 private constant BPS = 10_000;

    address public immutable guardian;
    uint64 public immutable challengeDelay;
    uint64 public immutable rotationDelay;
    uint256 public immutable releaseBpsPerDay;
    uint64 public immutable deployedAt;

    address public publisher;
    address public nextPublisher;
    uint64 public nextPublisherAt;

    uint256 public totalBurned;
    uint256 public totalClaimed;

    uint256 public settlementCount;
    uint256 public head;
    mapping(uint256 index => Settlement) public settlements;

    mapping(address account => uint256 amount) public claimed;
    mapping(address zap => uint64 enabledAt) public zapEnabledAt;

    uint256 private locked = 1;

    event Burned(address indexed from, uint256 amount, uint256 indexed campaignId, bytes32 memo);
    event SettlementPublished(uint256 indexed index, bytes32 root, uint256 total, uint64 claimableAt, bytes32 inputs);
    event SettlementVetoed(uint256 indexed index);
    event Claimed(address indexed account, uint256 indexed index, uint256 amount, address via);
    event PublisherProposed(address indexed next, uint64 effectiveAt);
    event PublisherChanged(address indexed publisher);
    event ZapScheduled(address indexed zap, uint64 enabledAt);
    event ZapDisabled(address indexed zap);

    error ZeroAddress();
    error InvalidRate();
    error NothingBurned();
    error NotPublisher();
    error NotGuardian();
    error EmptyRoot();
    error SettlementPending(uint256 index);
    error TotalDecreased(uint256 committed, uint256 total);
    error TotalAboveRelease(uint256 releasable, uint256 total);
    error UnknownSettlement(uint256 index);
    error Vetoed(uint256 index);
    error SettlementFinal(uint256 index);
    error NotYetClaimable(uint256 index, uint64 claimableAt);
    error InvalidProof();
    error NothingToClaim();
    error AboveSettlementTotal(uint256 total, uint256 wouldClaim);
    error TransferFailed();
    error ZapNotAllowed(address zap);
    error NotAContract(address target);
    error NoPendingPublisher();
    error RotationNotReady(uint64 effectiveAt);
    error Reentrancy();

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(
        address guardian_,
        address publisher_,
        uint64 challengeDelay_,
        uint64 rotationDelay_,
        uint256 releaseBpsPerDay_
    ) {
        if (guardian_ == address(0) || publisher_ == address(0)) revert ZeroAddress();
        if (releaseBpsPerDay_ == 0 || releaseBpsPerDay_ > BPS) revert InvalidRate();
        guardian = guardian_;
        publisher = publisher_;
        challengeDelay = challengeDelay_;
        rotationDelay = rotationDelay_;
        releaseBpsPerDay = releaseBpsPerDay_;
        deployedAt = uint64(block.timestamp);
    }

    receive() external payable {
        _burn(0, bytes32(0));
    }

    /// @notice Deposit ETH into the pool for good. It can only leave as mining rewards.
    function burn(uint256 campaignId, bytes32 memo) external payable {
        _burn(campaignId, memo);
    }

    /// @notice Publish a settlement: a root over cumulative (account, amount) entitlements.
    /// @param inputs Digest of the published claim table, so anyone can recompute the root.
    function publish(bytes32 root, uint256 total, bytes32 inputs) external returns (uint256 index) {
        if (msg.sender != publisher) revert NotPublisher();
        if (root == bytes32(0)) revert EmptyRoot();

        uint256 latest = settlementCount;
        if (latest != 0) {
            Settlement storage last = settlements[latest];
            if (!last.vetoed && block.timestamp < last.claimableAt) revert SettlementPending(latest);
        }

        uint256 base = committed();
        if (total < base) revert TotalDecreased(base, total);
        uint256 cap = releasable();
        if (total > cap) revert TotalAboveRelease(cap, total);

        index = latest + 1;
        uint64 claimableAt = uint64(block.timestamp) + challengeDelay;
        settlements[index] = Settlement({
            root: root,
            total: total,
            publishedAt: uint64(block.timestamp),
            claimableAt: claimableAt,
            vetoed: false,
            previous: head
        });
        settlementCount = index;
        head = index;
        emit SettlementPublished(index, root, total, claimableAt, inputs);
    }

    /// @notice Reject a settlement while it is still inside its challenge delay.
    function veto(uint256 index) external onlyGuardian {
        Settlement storage s = settlements[index];
        if (s.root == bytes32(0)) revert UnknownSettlement(index);
        if (s.vetoed) revert Vetoed(index);
        if (block.timestamp >= s.claimableAt) revert SettlementFinal(index);
        s.vetoed = true;
        if (head == index) head = s.previous;
        emit SettlementVetoed(index);
    }

    /// @notice Pay an account's unclaimed rewards in ETH. Anyone may trigger it; the ETH always
    /// goes to the account.
    function claim(uint256 index, address account, uint256 cumulative, bytes32[] calldata proof)
        external
        nonReentrant
        returns (uint256 amount)
    {
        if (account == address(0)) revert ZeroAddress();
        amount = _settle(index, account, cumulative, proof);
        emit Claimed(account, index, amount, address(0));
        (bool ok,) = account.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Claim through an allowed zap that converts the ETH into the account's paired
    /// asset. Only the account itself chooses the zap and its terms.
    function claimVia(uint256 index, uint256 cumulative, bytes32[] calldata proof, address zap, bytes calldata data)
        external
        nonReentrant
        returns (uint256 amount)
    {
        uint64 enabledAt = zapEnabledAt[zap];
        if (enabledAt == 0 || block.timestamp < enabledAt) revert ZapNotAllowed(zap);
        amount = _settle(index, msg.sender, cumulative, proof);
        emit Claimed(msg.sender, index, amount, zap);
        IPairZap(zap).deliver{value: amount}(msg.sender, data);
    }

    /// @notice Allow a zap after the challenge delay, so every new conversion route is public
    /// before anyone can use it.
    function allowZap(address zap) external onlyGuardian {
        if (zap.code.length == 0) revert NotAContract(zap);
        uint64 enabledAt = uint64(block.timestamp) + challengeDelay;
        zapEnabledAt[zap] = enabledAt;
        emit ZapScheduled(zap, enabledAt);
    }

    function disallowZap(address zap) external onlyGuardian {
        delete zapEnabledAt[zap];
        emit ZapDisabled(zap);
    }

    function proposePublisher(address next) external onlyGuardian {
        if (next == address(0)) revert ZeroAddress();
        uint64 effectiveAt = uint64(block.timestamp) + rotationDelay;
        nextPublisher = next;
        nextPublisherAt = effectiveAt;
        emit PublisherProposed(next, effectiveAt);
    }

    /// @notice Complete a publisher rotation once its delay has passed. Callable by anyone.
    function applyPublisher() external {
        address next = nextPublisher;
        if (next == address(0)) revert NoPendingPublisher();
        if (block.timestamp < nextPublisherAt) revert RotationNotReady(nextPublisherAt);
        publisher = next;
        delete nextPublisher;
        delete nextPublisherAt;
        emit PublisherChanged(next);
    }

    /// @notice Total committed by the current head settlement.
    function committed() public view returns (uint256) {
        return head == 0 ? 0 : settlements[head].total;
    }

    /// @notice The largest total a settlement published now could commit.
    function releasable() public view returns (uint256) {
        uint256 base = committed();
        uint256 uncommitted = totalBurned - base;
        uint256 since = head == 0 ? deployedAt : settlements[head].publishedAt;
        uint256 elapsed = block.timestamp - since;
        uint256 grow = uncommitted * releaseBpsPerDay * elapsed / (BPS * 1 days);
        return base + (grow > uncommitted ? uncommitted : grow);
    }

    function _burn(uint256 campaignId, bytes32 memo) private {
        if (msg.value == 0) revert NothingBurned();
        totalBurned += msg.value;
        emit Burned(msg.sender, msg.value, campaignId, memo);
    }

    function _settle(uint256 index, address account, uint256 cumulative, bytes32[] calldata proof)
        private
        returns (uint256 amount)
    {
        Settlement storage s = settlements[index];
        if (s.root == bytes32(0)) revert UnknownSettlement(index);
        if (s.vetoed) revert Vetoed(index);
        if (block.timestamp < s.claimableAt) revert NotYetClaimable(index, s.claimableAt);

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulative))));
        if (!MerkleProof.verifyCalldata(proof, s.root, leaf)) revert InvalidProof();

        uint256 already = claimed[account];
        if (cumulative <= already) revert NothingToClaim();
        amount = cumulative - already;

        uint256 after_ = totalClaimed + amount;
        if (after_ > s.total) revert AboveSettlementTotal(s.total, after_);

        claimed[account] = cumulative;
        totalClaimed = after_;
    }
}

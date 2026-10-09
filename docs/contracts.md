# Contracts

Three contracts make up the network on chain: the Burn Pool, the rig registry and the pair zap.
They are deployed on {{testnet.chainName}} (chain ID {{testnet.chainId}}), and the Burn Pool and the
rig registry on mainnet (chain ID 4663). They cannot be upgraded.
The maintainers audit them in rounds and publish every report in [audits](https://github.com/mineragpu/minera/tree/main/audits);
the final round covers the exact code to deploy on mainnet.

## Mainnet addresses

Deployed on 2026-10-09, ETH-only: there is no pair zap on mainnet yet, so claims pay in ETH. Both
contracts are verified with an exact source match on Sourcify.

| Contract | Address |
|---|---|
| Burn Pool | [`0xa9f0BaB0AE7cc4A7B605D831d57A3A2a0E7921D8`](https://robinhoodchain.blockscout.com/address/0xa9f0BaB0AE7cc4A7B605D831d57A3A2a0E7921D8) |
| Rig registry | [`0xbe078e15cF90c21Bf23BCFBE94DBC9E44ceFd4d1`](https://robinhoodchain.blockscout.com/address/0xbe078e15cF90c21Bf23BCFBE94DBC9E44ceFd4d1) |
| Guardian | [`0x90F4B2B88C3459555977B153ebA6BACB4420EADA`](https://robinhoodchain.blockscout.com/address/0x90F4B2B88C3459555977B153ebA6BACB4420EADA) |
| Publisher | [`0xB677A0A954dBb26A0Fd7ec874d1c232D56e2c98A`](https://robinhoodchain.blockscout.com/address/0xB677A0A954dBb26A0Fd7ec874d1c232D56e2c98A) |

Mainnet parameters: a 6-hour challenge delay, a 48-hour publisher rotation delay, a release limit
of 10% of the uncommitted pool per day and a 24-hour pair listing delay. The guardian is a key used
for nothing else ([final audit round](https://github.com/mineragpu/minera/blob/main/audits/2026-10-09-contracts-final-round.md)).
The same deployer created the testnet contracts, so two mainnet addresses repeat testnet addresses
that belong to different contracts there: check the chain ID before you send anything.

## Testnet addresses

| Contract | Address |
|---|---|
| Burn Pool | [`{{testnet.burnPool}}`]({{testnet.explorer}}/address/{{testnet.burnPool}}) |
| Rig registry | [`{{testnet.rigRegistry}}`]({{testnet.explorer}}/address/{{testnet.rigRegistry}}) |
| Pair zap | [`{{testnet.pairZap}}`]({{testnet.explorer}}/address/{{testnet.pairZap}}) |

| Role | Address | Powers |
|---|---|---|
| Guardian | [`{{testnet.guardian}}`]({{testnet.explorer}}/address/{{testnet.guardian}}) | Vetoes settlements inside their challenge delay, schedules and disables zaps, proposes a publisher, lists and delists pairs. It cannot move funds. |
| Publisher | [`{{testnet.publisher}}`]({{testnet.explorer}}/address/{{testnet.publisher}}) | Publishes settlements within the release limit. The coordinator holds this key. |

The first block that can contain their events is {{testnet.startBlock}}.

All three contracts are verified on the explorer with an exact source match: open an address above
to read the source. They are written in Solidity 0.8.30 and licensed under Apache-2.0. The source is
in `packages/contracts/src` of the repository.

## Parameters

Every parameter is immutable, set at deployment from `packages/contracts/deploy/<network>.json`.

| Parameter | Contract | Mainnet value | Testnet value |
|---|---|---|---|
| `challengeDelay` | Burn Pool | {{mainnet.challengeDelay}} | {{testnet.challengeDelay}} |
| `releaseBpsPerDay` | Burn Pool | {{mainnet.releaseBpsPerDay}} basis points: {{mainnet.releasePercentPerDay}} | {{testnet.releaseBpsPerDay}} basis points: {{testnet.releasePercentPerDay}} |
| `rotationDelay` | Burn Pool | {{mainnet.rotationDelay}} | {{testnet.rotationDelay}} |
| `listingDelay` | Rig registry | {{mainnet.listingDelay}} | {{testnet.listingDelay}} |

The challenge delay comes before a settlement is claimable and before a new zap is usable. The
release limit is a share of the uncommitted balance per day. The rotation delay comes before a
proposed publisher can take over, and the listing delay before a listed pair can be used.

## Listed pairs

On mainnet, ETH only for now:

{{mainnet.pairTable}}

On testnet:

{{testnet.pairTable}}

## Contracts they call

On testnet; mainnet has no pair zap yet, so it calls none of them.

| Contract | Address | Used for |
|---|---|---|
| Swap router | [`{{testnet.router}}`]({{testnet.explorer}}/address/{{testnet.router}}) | The pair zap swaps through it. |
| Stock token registry | [`{{testnet.stockRegistry}}`]({{testnet.explorer}}/address/{{testnet.stockRegistry}}) | The blocklist and global pause shared by the chain's stock tokens. The pair zap checks both before a swap. |
| Quoter | [`{{testnet.quoter}}`]({{testnet.explorer}}/address/{{testnet.quoter}}) | The site prices stock claims with it. No contract calls it. |

## Burn Pool

Holds the ETH that pays rewards. See [Burn Pool](burn-pool.md) for how it works.

### Functions

| Function | Caller | What it does |
|---|---|---|
| `burn(uint256 campaignId, bytes32 memo)` payable | Anyone | Deposits the ETH sent, for good. |
| `receive()` | Anyone | A plain transfer: a burn with campaign id 0 and an empty memo. |
| `publish(bytes32 root, uint256 total, bytes32 inputs) returns (uint256 index)` | Publisher | Publishes a settlement. `inputs` is the digest of its inputs document. |
| `veto(uint256 index)` | Guardian | Rejects a settlement inside its challenge delay. |
| `claim(uint256 index, address account, uint256 cumulative, bytes32[] proof) returns (uint256 amount)` | Anyone | Pays the account's unclaimed rewards in ETH, always to the account. |
| `claimVia(uint256 index, uint256 cumulative, bytes32[] proof, address zap, bytes data) returns (uint256 amount)` | The account | Pays the caller's unclaimed rewards through an allowed zap. |
| `allowZap(address zap)` | Guardian | Allows a zap, usable after the challenge delay. |
| `disallowZap(address zap)` | Guardian | Disallows a zap at once. |
| `proposePublisher(address next)` | Guardian | Starts a publisher rotation. |
| `applyPublisher()` | Anyone | Completes a rotation once its delay has passed. |

| Read | Returns |
|---|---|
| `committed()` | The total committed by the head settlement, in wei. |
| `releasable()` | The largest total a settlement published now could commit. |
| `totalBurned()`, `totalClaimed()` | Running totals, in wei. |
| `settlementCount()`, `head()` | How many settlements were published, and the index of the head (0 when there is none). |
| `settlements(uint256 index)` | `root`, `total`, `publishedAt`, `claimableAt`, `vetoed`, `previous`. |
| `claimed(address account)` | The cumulative amount the account has claimed. |
| `zapEnabledAt(address zap)` | When a zap becomes usable, or 0 when it is not allowed. |
| `publisher()`, `nextPublisher()`, `nextPublisherAt()` | The publisher, and a pending rotation. |
| `guardian()`, `challengeDelay()`, `rotationDelay()`, `releaseBpsPerDay()`, `deployedAt()` | The fixed parameters. |

### Events

| Event | When |
|---|---|
| `Burned(address indexed from, uint256 amount, uint256 indexed campaignId, bytes32 memo)` | ETH is burned. |
| `SettlementPublished(uint256 indexed index, bytes32 root, uint256 total, uint64 claimableAt, bytes32 inputs)` | A settlement is published. |
| `SettlementVetoed(uint256 indexed index)` | The guardian vetoes a settlement. |
| `Claimed(address indexed account, uint256 indexed index, uint256 amount, address via)` | A claim is paid. `via` is the zap, or the zero address for ETH. |
| `PublisherProposed(address indexed next, uint64 effectiveAt)` | A rotation starts. |
| `PublisherChanged(address indexed publisher)` | A rotation completes. |
| `ZapScheduled(address indexed zap, uint64 enabledAt)` | A zap is allowed. |
| `ZapDisabled(address indexed zap)` | A zap is disallowed. |

### Errors

| Error | Meaning |
|---|---|
| `NothingBurned()` | A burn sent no ETH. |
| `NotPublisher()`, `NotGuardian()` | The caller lacks the role. |
| `EmptyRoot()` | A settlement root is zero. |
| `SettlementPending(index)` | The latest settlement is still inside its challenge delay. |
| `TotalDecreased(committed, total)` | A settlement total is below what is committed. |
| `TotalAboveRelease(releasable, total)` | A settlement total is above the release limit. |
| `UnknownSettlement(index)` | No settlement has this index. |
| `Vetoed(index)` | The settlement was vetoed. |
| `SettlementFinal(index)` | A veto came after the challenge delay. |
| `NotYetClaimable(index, claimableAt)` | The settlement is still inside its challenge delay. |
| `InvalidProof()` | The Merkle proof does not match the root. |
| `NothingToClaim()` | The account already claimed this cumulative amount. |
| `AboveSettlementTotal(total, wouldClaim)` | Claims would add up past the settlement's total. |
| `TransferFailed()` | The account did not accept the ETH. |
| `ZapNotAllowed(zap)` | The zap is not allowed, or not usable yet. |
| `NotAContract(target)` | A zap address has no code. |
| `NoPendingPublisher()`, `RotationNotReady(effectiveAt)` | There is no rotation to apply, or its delay has not passed. |
| `ZeroAddress()`, `InvalidRate()`, `Reentrancy()` | A zero address or an invalid rate was given, or a call re-entered the pool. |

## Rig registry

The launchpad on chain: each rig's node key, operator, pair, deploy time and whether it is retired.
See [Deploy a rig](deploy-a-rig.md).

### Functions

| Function | Caller | What it does |
|---|---|---|
| `deploy(address nodeKey, address pair, string name, bytes authorization)` | Anyone holding the node key's deploy code for their wallet | Deploys a rig operated by the caller. |
| `setPair(address nodeKey, address pair)` | The rig's operator | Changes the rig's pair. |
| `retire(address nodeKey)` | The rig's operator | Retires the rig for good. The node key cannot be deployed again. |
| `listPair(address asset)` | Guardian | Lists an asset, usable after the listing delay. |
| `delistPair(address asset)` | Guardian | Stops new deployments and pair changes to an asset. |

| Read | Returns |
|---|---|
| `rigs(address nodeKey)` | `operator`, `pair`, `deployedAt`, `retired`. |
| `rigCount()` | How many rigs were ever deployed. |
| `isPairListed(address asset)` | Whether an asset can be used as a pair now. ETH, the zero address, always can. |
| `pairListedAt(address asset)` | When a listed asset becomes usable, or 0. |
| `deployDigest(address operator)` | The digest a node key signs to let `operator` deploy it. |
| `guardian()`, `listingDelay()` | The fixed parameters. |

The deploy digest is `keccak256(abi.encode("rig-deploy-v1", block.chainid, address(this), operator))`,
and the deploy code is the node key's EIP-191 signature over it.

### Events

| Event | When |
|---|---|
| `RigDeployed(address indexed nodeKey, address indexed operator, address indexed pair, string name)` | A rig is deployed. |
| `PairChanged(address indexed nodeKey, address indexed pair)` | A rig's pair changes. |
| `RigRetired(address indexed nodeKey)` | A rig is retired. |
| `PairScheduled(address indexed asset, uint64 listedAt)` | An asset is listed. |
| `PairDelisted(address indexed asset)` | An asset is delisted. |

### Errors

| Error | Meaning |
|---|---|
| `AlreadyDeployed(nodeKey)` | The node key is already a rig. |
| `InvalidName()` | The name is empty or longer than 32 bytes. |
| `PairNotListed(asset)` | The pair is not listed, or its listing delay has not passed. |
| `InvalidAuthorization()` | The deploy code was not signed by the node key for this wallet, registry and chain. |
| `UnknownRig(nodeKey)`, `NotOperator(nodeKey)`, `RigIsRetired(nodeKey)` | The rig does not exist, the caller is not its operator, or it is retired. |
| `NotGuardian()`, `NotAContract(asset)`, `ZeroAddress()` | The caller is not the guardian, a listed asset has no code, or a zero address was given. |

## Pair zap

Converts a claim's ETH into a listed stock token and delivers it. See
[Pairs and claims](pairs-and-claims.md).

| Function | What it does |
|---|---|
| `deliver(address account, bytes data)` payable | Swaps the ETH sent along the asset's route and transfers the token to `account`, or reverts. `data` is `abi.encode(asset, minOut, deadline)`. The Burn Pool calls it during `claimVia`. |
| `routeOf(address asset)` | The route for an asset: `asset`, `fee`, `tickSpacing`. |
| `listedAssets()` | Every asset with a route. |
| `router()`, `registry()` | The swap router and the stock token registry it uses. |

| Event | When |
|---|---|
| `Delivered(address indexed account, address indexed asset, uint256 ethIn, uint256 assetOut)` | A conversion is delivered. |

| Error | Meaning |
|---|---|
| `UnknownPair(asset)` | The asset has no route in this zap. |
| `Expired(deadline)` | The claim's deadline has passed. |
| `AmountTooLarge()` | An amount does not fit the swap. |
| `MarketPaused()` | The stock token registry is paused. |
| `RecipientBlocked(account)` | The account is on the stock token registry's blocklist. |
| `InsufficientOutput(received, minimum)` | The swap delivered less than the minimum. |
| `ZeroAddress()`, `DuplicateRoute(asset)` | Invalid routes were given at deployment. |

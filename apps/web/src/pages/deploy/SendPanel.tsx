import type { Address, PairAsset } from '@dayagpu/shared';
import { decodeEventLog } from 'viem';
import { rigRegistryAbi } from '../../chain/abi.ts';
import type { Receipt } from '../../chain/rpc.ts';
import type { Transaction } from '../../chain/useTransaction.ts';
import { Button } from '../../components/Button.tsx';
import { TxStatus } from '../../components/TxStatus.tsx';
import { shortAddress } from '../../wallet/format.ts';
import { DeployedNote } from './DeployedNote.tsx';
import '../../components/panel.css';

interface SendPanelProps {
  operator: Address | null;
  nodeAddress: Address | null;
  name: string;
  pair: PairAsset;
  registry: Address;
  /** Why the deploy cannot be sent yet, or null once it can. */
  blocker: string | null;
  transaction: Transaction;
  onSend: () => void;
  onStartOver: () => void;
}

const BUTTON_LABELS = {
  idle: 'Deploy rig',
  checking: 'Checking…',
  confirming: 'Confirm in your wallet',
  pending: 'Waiting for the network…',
  confirmed: 'Deployed',
  failed: 'Try again',
} as const;

/** The rig the registry reports in the receipt's `RigDeployed` event. */
function deployedRig(receipt: Receipt, registry: Address): { nodeKey: Address; name: string } | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registry.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: rigRegistryAbi, eventName: 'RigDeployed', data: log.data, topics: log.topics });
      return { nodeKey: event.args.nodeKey, name: event.args.name };
    } catch {
      continue;
    }
  }
  return null;
}

export function SendPanel(props: SendPanelProps) {
  const { operator, nodeAddress, name, pair, registry, blocker, transaction, onSend, onStartOver } = props;
  const { state } = transaction;
  const busy = state.phase === 'checking' || state.phase === 'confirming' || state.phase === 'pending';
  const done = state.phase === 'confirmed';
  const rig = state.phase === 'confirmed' ? deployedRig(state.receipt, registry) : null;
  const deployedKey = rig?.nodeKey ?? nodeAddress;

  return (
    <aside className="panel send-panel" aria-labelledby="send-title">
      <div className="panel__head">
        <h2 className="panel__title" id="send-title">
          Send the deploy
        </h2>
        <span className="status">Step 06</span>
      </div>
      <dl className="send-summary">
        <div>
          <dt>Operator</dt>
          <dd>{operator ? shortAddress(operator) : 'Not connected'}</dd>
        </div>
        <div>
          <dt>Node</dt>
          <dd>{nodeAddress ? shortAddress(nodeAddress) : 'Not pasted yet'}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{name || 'Not named yet'}</dd>
        </div>
        <div>
          <dt>Pair</dt>
          <dd>{pair.symbol}</dd>
        </div>
      </dl>
      <p className="send-panel__fee">One transaction to the rig registry. You pay only the network fee.</p>
      <Button
        variant="primary"
        block
        disabled={blocker !== null || busy || done}
        aria-busy={busy}
        onClick={onSend}
        aria-describedby="send-blocker"
      >
        {BUTTON_LABELS[state.phase]}
      </Button>
      <p className="send-panel__note" id="send-blocker">
        {blocker ?? ''}
      </p>
      <TxStatus
        state={state}
        confirmed={deployedKey && <DeployedNote nodeKey={deployedKey} name={rig?.name ?? name} />}
      />
      {done && (
        <Button variant="ghost" size="sm" glint={false} onClick={onStartOver}>
          Deploy another rig
        </Button>
      )}
    </aside>
  );
}

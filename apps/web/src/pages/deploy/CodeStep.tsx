import type { Address, Hex } from '@dayagpu/shared';
import { InlineCode } from '../../components/InlineCode.tsx';
import { rigPath } from '../../router/routes.ts';
import type { CodeCheck } from './useDeployCodeCheck.ts';
import type { RigLookup } from './useRigLookup.ts';

interface CodeStepProps {
  nodeInput: string;
  codeInput: string;
  onNodeInput: (value: string) => void;
  onCodeInput: (value: string) => void;
  nodeAddress: Address | null;
  code: Hex | null;
  check: CodeCheck;
  lookup: RigLookup;
  /** A wallet is connected on the right network, so the code can be checked against it. */
  walletReady: boolean;
  locked: boolean;
}

const MISMATCH =
  'This deploy code was not signed by this node for this wallet and network. Run `code` again with this wallet.';

function CheckMessage({ nodeInput, codeInput, nodeAddress, code, check, lookup, walletReady }: CodeStepProps) {
  if (nodeInput.trim() && !nodeAddress) {
    return <p className="field-status field-status--error">A node address is 0x followed by 40 hexadecimal characters.</p>;
  }
  if (codeInput.trim() && !code) {
    return <p className="field-status field-status--error">A deploy code is 0x followed by 130 hexadecimal characters.</p>;
  }
  if (!nodeAddress || !code) return null;
  if (!walletReady) return <p className="field-status">Connect your wallet on the right network to check the code.</p>;
  if (check !== 'match' && check !== 'mismatch') return <p className="field-status">Checking the deploy code…</p>;
  if (check === 'mismatch') {
    return (
      <p className="field-status field-status--error">
        <InlineCode text={MISMATCH} />
      </p>
    );
  }
  if (lookup === 'deployed') {
    return (
      <p className="field-status field-status--error">
        This node is already deployed. Each node key deploys once.{' '}
        <a className="text-link" href={rigPath(nodeAddress)}>
          Open its rig page
        </a>
      </p>
    );
  }
  return <p className="field-status field-status--ok">The deploy code matches this node and this wallet.</p>;
}

export function CodeStep(props: CodeStepProps) {
  const { nodeInput, codeInput, onNodeInput, onCodeInput, nodeAddress, code, locked } = props;
  return (
    <div className="flow-fields">
      <div className="field">
        <label className="flabel" htmlFor="node-address">
          Node address
        </label>
        <input
          className="input input--mono"
          id="node-address"
          type="text"
          value={nodeInput}
          onChange={(event) => onNodeInput(event.target.value)}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          disabled={locked}
          aria-invalid={nodeInput.trim() !== '' && !nodeAddress}
          aria-describedby="code-status"
        />
      </div>
      <div className="field">
        <label className="flabel" htmlFor="deploy-code">
          Deploy code
        </label>
        <textarea
          className="input input--mono"
          id="deploy-code"
          value={codeInput}
          onChange={(event) => onCodeInput(event.target.value)}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          disabled={locked}
          aria-invalid={codeInput.trim() !== '' && !code}
          aria-describedby="deploy-code-hint code-status"
        />
        <p className="hint" id="deploy-code-hint">
          It only lets this wallet deploy this node. It cannot move funds and is not a secret.
        </p>
      </div>
      <div id="code-status" role="status">
        <CheckMessage {...props} />
      </div>
    </div>
  );
}

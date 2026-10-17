import { useState, type ReactNode } from 'react';
import { BRAND, type Address } from '@minera/shared';
import { CommandBlock } from '../../components/CommandBlock.tsx';
import { LiveDot } from '../../components/LiveDot.tsx';
import { ON_MAINNET, RIG_NETWORK_FLAG } from '../../config/network.ts';
import { docPath } from '../docs/manifest.ts';
import type { Pairing } from './usePairing.ts';
import type { CodeCheck } from './useDeployCodeCheck.ts';
import '../../components/segmented.css';

const { package: PACKAGE, command: CLI } = BRAND.nodeClient;
const PLACEHOLDER = '0xYourWalletAddress';

type System = 'linux' | 'other';

interface MachineStepProps {
  operator: Address | null;
  code: string;
  pairing: Pairing;
  check: CodeCheck;
  /** Paste the node address and deploy code by hand instead of pairing. */
  manual: boolean;
  onManual: (manual: boolean) => void;
  onNewCode: () => void;
  /** The paste-by-hand fields, shown in manual mode. */
  manualFields: ReactNode;
  locked: boolean;
}

function commandLines(system: System, wallet: string, code: string): string[] {
  if (system === 'linux') {
    const network = ON_MAINNET ? '' : ' NETWORK=testnet';
    return [`curl -fsSLO ${BRAND.links.site}/rig.sh && OPERATOR=${wallet} PAIR=${code}${network} bash rig.sh`];
  }
  return [
    `npm install --global ${PACKAGE}`,
    `${CLI} pair --code ${code} --operator ${wallet}${RIG_NETWORK_FLAG} --start --keep-model`,
  ];
}

function gpuText(gpu: { model: string; vramMb: number } | null): string {
  if (gpu === null) return 'No GPU reported';
  return gpu.vramMb > 0 ? `${gpu.model}, ${Math.round(gpu.vramMb / 1024)} GB` : gpu.model;
}

function MachineStatus({ pairing, check, operator }: Pick<MachineStepProps, 'pairing' | 'check' | 'operator'>) {
  if (pairing.state === 'off') return null;
  if (pairing.state === 'waiting') {
    return (
      <div className="machine machine--waiting" role="status">
        <span className="machine__pulse" aria-hidden="true" />
        <div>
          <p className="machine__title">Waiting for your machine…</p>
          <p className="machine__text">
            {pairing.problem
              ? 'The network is not answering right now. This page keeps trying.'
              : 'Run the command on the GPU machine. This page fills in the rest as soon as it connects.'}
          </p>
        </div>
      </div>
    );
  }
  const { machine } = pairing;
  const otherWallet = operator !== null && machine.operator.toLowerCase() !== operator.toLowerCase();
  return (
    <div className={otherWallet || check === 'mismatch' ? 'machine machine--problem' : 'machine machine--paired'} role="status">
      <LiveDot />
      <div>
        <p className="machine__title">Machine connected</p>
        <dl className="machine__facts">
          <div>
            <dt>GPU</dt>
            <dd>{gpuText(machine.gpu)}</dd>
          </div>
          <div>
            <dt>Node address</dt>
            <dd className="mono">{machine.nodeAddress}</dd>
          </div>
        </dl>
        {otherWallet ? (
          <p className="machine__text machine__text--error">
            This machine paired for wallet {machine.operator}. Connect that wallet, or pair again with this one.
          </p>
        ) : (
          <p className="machine__text">
            {check === 'match'
              ? 'Deploy code checked in your browser. Name the rig below and deploy it.'
              : check === 'mismatch'
                ? 'The deploy code does not match this wallet and network. Pair again.'
                : 'Checking the deploy code…'}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Step two of the Deploy page: one command for the GPU machine, which pairs it with this page.
 * The node address and deploy code arrive on their own; pasting them by hand stays possible.
 */
export function MachineStep(props: MachineStepProps) {
  const { operator, code, pairing, manual, onManual, onNewCode, manualFields, locked } = props;
  const [system, setSystem] = useState<System>('linux');
  const wallet = operator ?? PLACEHOLDER;

  if (manual) {
    return (
      <>
        <p className="flow-step__text">
          Paste what <code>{CLI} init</code> or <code>{CLI} code</code> printed on the GPU machine.
        </p>
        {manualFields}
        <button type="button" className="text-link machine__switch" onClick={() => onManual(false)} disabled={locked}>
          Use the one-line command instead
        </button>
      </>
    );
  }

  return (
    <>
      <p className="flow-step__text">
        Run one command on the machine with the GPU, your own or a rented one. It installs what the rig needs and pairs
        the machine with this page. After you deploy, the node starts on its own.
      </p>
      <div className="seg machine__system" role="group" aria-label="The GPU machine's system">
        <button type="button" aria-pressed={system === 'linux'} onClick={() => setSystem('linux')}>
          Linux
        </button>
        <button type="button" aria-pressed={system === 'other'} onClick={() => setSystem('other')}>
          Windows or macOS
        </button>
      </div>
      <CommandBlock label="the setup command" lines={commandLines(system, wallet, code)} />
      <p className="hint">
        {system === 'linux'
          ? 'For Ubuntu or Debian with the GPU driver installed, as rented GPU machines come. It installs Node.js 22, a local model runtime and the node client.'
          : 'Needs Node.js 22, the GPU driver and a local model runtime. The node downloads the model it needs.'}{' '}
        <a className="text-link" href={docPath(system === 'linux' ? 'where-to-run-a-rig' : 'quickstart')}>
          {system === 'linux' ? 'Where to run a rig' : 'Quickstart'}
        </a>
      </p>
      {!operator && <p className="hint">Connect your wallet to put its address in the command.</p>}
      {operator && <MachineStatus pairing={pairing} check={props.check} operator={operator} />}
      <div className="machine__links">
        {pairing.state === 'paired' && !locked && (
          <button type="button" className="text-link machine__switch" onClick={onNewCode}>
            Pair a different machine
          </button>
        )}
        <button type="button" className="text-link machine__switch" onClick={() => onManual(true)} disabled={locked}>
          Paste a node address and deploy code instead
        </button>
      </div>
    </>
  );
}

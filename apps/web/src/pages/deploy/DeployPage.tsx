import { useState } from 'react';
import { ETH_PAIR, type Address } from '@minera/shared';
import { encodeFunctionData } from 'viem';
import { rigRegistryAbi } from '../../chain/abi.ts';
import { useTransaction } from '../../chain/useTransaction.ts';
import { DEPLOYMENT, PAIR_LISTING } from '../../config/contracts.ts';
import { ACTIVE_CHAIN } from '../../config/network.ts';
import { useDocumentTitle } from '../../router/useDocumentTitle.ts';
import { useWallet } from '../../wallet/useWallet.ts';
import { WalletPrompt } from '../../wallet/WalletPrompt.tsx';
import { PageHead } from '../PageHead.tsx';
import { CodeStep } from './CodeStep.tsx';
import { FlowStep } from './FlowStep.tsx';
import { MachineStep } from './MachineStep.tsx';
import { NameStep } from './NameStep.tsx';
import { PairStep } from './PairStep.tsx';
import { renewPairingCode, sessionPairingCode } from './pairingCode.ts';
import { SendPanel } from './SendPanel.tsx';
import { useDeployCodeCheck } from './useDeployCodeCheck.ts';
import { usePairing } from './usePairing.ts';
import { useRigLookup } from './useRigLookup.ts';
import { isValidName, parseDeployCode, parseNodeAddress, rigName } from './validation.ts';
import '../../components/form.css';
import './deploy-page.css';

export function DeployPage() {
  useDocumentTitle('Deploy a rig');
  const { status, address, isCorrectNetwork } = useWallet();
  const transaction = useTransaction();
  const [nodeInput, setNodeInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [pairAddress, setPairAddress] = useState<Address>(ETH_PAIR);
  const [pairingCode, setPairingCode] = useState(sessionPairingCode);
  const [manual, setManual] = useState(false);

  const walletReady = status === 'connected' && address !== null && isCorrectNetwork;
  const operator = walletReady ? address : null;
  const pairing = usePairing(manual || !operator ? null : pairingCode);
  const paired = pairing.state === 'paired' ? pairing.machine : null;
  const nodeAddress = manual ? parseNodeAddress(nodeInput) : (paired?.nodeAddress ?? null);
  const code = manual ? parseDeployCode(codeInput) : (paired?.deployCode ?? null);
  const check = useDeployCodeCheck(nodeAddress, code, operator);
  const lookup = useRigLookup(nodeAddress);
  const nameValid = isValidName(nameInput);
  const pair = PAIR_LISTING.assets.find((asset) => asset.address === pairAddress) ?? PAIR_LISTING.assets[0];
  const phase = transaction.state.phase;
  const locked = phase === 'checking' || phase === 'confirming' || phase === 'pending' || phase === 'confirmed';

  if (!DEPLOYMENT || !pair) {
    return (
      <div className="shell">
        <PageHead kicker="Deploy" title="Deploy a rig.">
          The rig registry is not deployed on {ACTIVE_CHAIN.name} yet, so there is nothing to deploy to.
        </PageHead>
      </div>
    );
  }
  const registry = DEPLOYMENT.rigRegistry;

  let blocker: string | null = null;
  if (status !== 'connected') blocker = 'Connect your wallet first.';
  else if (!isCorrectNetwork) blocker = `Switch your wallet to ${ACTIVE_CHAIN.name} first.`;
  else if (!manual && !nodeAddress) blocker = 'Run the command on the GPU machine and wait for it to connect.';
  else if (!nodeAddress) blocker = 'Paste the node address.';
  else if (!code) blocker = 'Paste the deploy code.';
  else if (check === 'mismatch') blocker = 'The deploy code does not match this node and wallet.';
  else if (check !== 'match') blocker = 'Checking the deploy code…';
  else if (lookup === 'deployed') blocker = 'This node is already deployed.';
  else if (!nameValid) blocker = 'Name the rig, in 1 to 32 bytes.';

  const send = () => {
    if (blocker !== null || !nodeAddress || !code) return;
    const data = encodeFunctionData({
      abi: rigRegistryAbi,
      functionName: 'deploy',
      args: [nodeAddress, pair.address, rigName(nameInput), code],
    });
    void transaction.send({ to: registry, data });
  };

  const startOver = () => {
    transaction.reset();
    setNodeInput('');
    setCodeInput('');
    setNameInput('');
    setPairAddress(ETH_PAIR);
    setPairingCode(renewPairingCode());
  };

  const codeReady = check === 'match' && lookup !== 'deployed';

  return (
    <div className="shell">
      <PageHead kicker="Deploy" title="Deploy a rig.">
        One command on the GPU machine, then one transaction here. Your wallet operates the rig, and the rig goes on
        the board about a minute after the transaction lands.
      </PageHead>
      <div className="deploy-flow page-body">
        <ol className="flow">
          <FlowStep number={1} title="Connect your wallet" done={walletReady}>
            <WalletPrompt reason="The wallet you connect operates the rig: it deploys it and receives its rewards." />
          </FlowStep>
          <FlowStep number={2} title="Set up the GPU machine" done={codeReady}>
            <MachineStep
              operator={operator}
              code={pairingCode}
              pairing={pairing}
              check={check}
              manual={manual}
              onManual={setManual}
              onNewCode={() => setPairingCode(renewPairingCode())}
              locked={locked}
              manualFields={
                <CodeStep
                  nodeInput={nodeInput}
                  codeInput={codeInput}
                  onNodeInput={setNodeInput}
                  onCodeInput={setCodeInput}
                  nodeAddress={nodeAddress}
                  code={code}
                  check={check}
                  lookup={lookup}
                  walletReady={walletReady}
                  locked={locked}
                />
              }
            />
          </FlowStep>
          <FlowStep number={3} title="Name the rig" done={nameValid}>
            <NameStep value={nameInput} onChange={setNameInput} locked={locked} />
          </FlowStep>
          <FlowStep number={4} title="Choose what it pairs with" done={blocker === null}>
            <PairStep value={pair.address} onChange={setPairAddress} locked={locked} />
          </FlowStep>
        </ol>
        <SendPanel
          operator={operator}
          nodeAddress={nodeAddress}
          name={rigName(nameInput)}
          pair={pair}
          registry={registry}
          blocker={blocker}
          transaction={transaction}
          onSend={send}
          onStartOver={startOver}
          paired={!manual}
        />
      </div>
    </div>
  );
}

import { Button } from '../components/Button.tsx';
import { ACTIVE_CHAIN } from '../config/network.ts';
import { AccountSummary } from './AccountSummary.tsx';
import { useWallet } from './useWallet.ts';

/** Shown while the connected wallet is on a network other than the one this build targets. */
export function NetworkPrompt() {
  const { switching, switchNetwork, disconnect } = useWallet();

  return (
    <>
      <p className="wallet-dialog__lead">
        Your wallet is on another network. Switch to <b>{ACTIVE_CHAIN.name}</b> to continue.
      </p>
      <AccountSummary />
      <div className="wallet-dialog__actions">
        <Button variant="primary" size="sm" data-autofocus="" aria-busy={switching} onClick={() => void switchNetwork()}>
          {switching ? 'Confirm in your wallet' : 'Switch network'}
        </Button>
        <Button variant="ghost" size="sm" glint={false} onClick={() => void disconnect()}>
          Disconnect
        </Button>
      </div>
      <p className="wallet-dialog__note">If your wallet does not know this network yet, it asks to add it first.</p>
    </>
  );
}

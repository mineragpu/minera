import { Button } from '../components/Button.tsx';
import { ACTIVE_CHAIN } from '../config/network.ts';
import { shortAddress } from './format.ts';
import { NetworkBadge } from './NetworkBadge.tsx';
import { useConnectDialog } from './useConnectDialog.ts';
import { useWallet } from './useWallet.ts';
import './wallet-prompt.css';

/** The one wallet action a page still needs: connect, switch network, or nothing once ready. */
export function WalletPrompt({ reason }: { reason: string }) {
  const { status, address, isCorrectNetwork, switching, switchNetwork, error } = useWallet();
  const dialog = useConnectDialog();

  if (status !== 'connected' || !address) {
    return (
      <div className="wallet-prompt">
        <p>{reason}</p>
        <Button variant="primary" size="sm" aria-haspopup="dialog" onClick={(event) => dialog.open(event.currentTarget)}>
          {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
        </Button>
      </div>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <div className="wallet-prompt">
        <p>
          Your wallet is on another network. Switch to <b>{ACTIVE_CHAIN.name}</b> to continue.
        </p>
        <Button variant="primary" size="sm" aria-busy={switching} onClick={() => void switchNetwork()}>
          {switching ? 'Confirm in your wallet' : 'Switch network'}
        </Button>
        {error && (
          <p className="wallet-prompt__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <p className="wallet-prompt wallet-prompt--ready">
      <span>
        Connected as{' '}
        <span className="wallet-prompt__address" title={address}>
          {shortAddress(address)}
        </span>
      </span>
      <NetworkBadge correct full />
    </p>
  );
}

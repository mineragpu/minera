import { Button } from '../components/Button.tsx';
import { WalletIcon } from '../components/icons.tsx';
import { shortAddress } from './format.ts';
import { NetworkBadge } from './NetworkBadge.tsx';
import { useConnectDialog } from './useConnectDialog.ts';
import { useWallet } from './useWallet.ts';
import './wallet-button.css';

/** The top bar's wallet control. On phones it collapses to an icon with the same accessible name. */
export function WalletButton() {
  const { status, address, isCorrectNetwork } = useWallet();
  const dialog = useConnectDialog();
  const state = status !== 'connected' ? 'idle' : isCorrectNetwork ? 'ready' : 'wrong';

  return (
    <Button
      variant="ghost"
      size="sm"
      glint={false}
      className={`wallet-button wallet-button--${state}`}
      aria-haspopup="dialog"
      onClick={(event) => dialog.open(event.currentTarget)}
    >
      <i className="wallet-button__dot" aria-hidden="true" />
      <WalletIcon className="wallet-button__icon" />
      <span className="wallet-button__label">
        {address ? (
          <>
            <span className="sr-only">Wallet </span>
            {shortAddress(address)}
          </>
        ) : status === 'connecting' ? (
          'Connecting…'
        ) : (
          'Connect wallet'
        )}
      </span>
      {address && (
        <span className="wallet-button__badge">
          <NetworkBadge correct={isCorrectNetwork} />
        </span>
      )}
    </Button>
  );
}

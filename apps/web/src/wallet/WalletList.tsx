import { WALLET_MESSAGES } from './errors.ts';
import { useWallet } from './useWallet.ts';
import { WalletMark } from './WalletMark.tsx';

/** The wallets found in this browser, each under its own name and icon. */
export function WalletList() {
  const { wallets, pendingId, connect } = useWallet();

  if (wallets.length === 0) {
    return <p className="wallet-dialog__lead">{WALLET_MESSAGES.noWallet}</p>;
  }

  return (
    <>
      <p className="wallet-dialog__lead">Choose a wallet installed in this browser.</p>
      <ul className="wallet-list">
        {wallets.map((wallet, index) => {
          const pending = pendingId === wallet.id;
          return (
            <li key={wallet.id}>
              <button
                type="button"
                className="wallet-option"
                data-autofocus={index === 0 ? '' : undefined}
                aria-disabled={pendingId !== null && !pending}
                aria-busy={pending}
                onClick={() => void connect(wallet.id)}
              >
                <WalletMark wallet={wallet} />
                <span className="wallet-option__name">{wallet.name}</span>
                <span className="wallet-option__state">{pending ? 'Confirm in wallet' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="wallet-dialog__note">
        Connecting shares your address with this page. It sends nothing without your confirmation.
      </p>
    </>
  );
}

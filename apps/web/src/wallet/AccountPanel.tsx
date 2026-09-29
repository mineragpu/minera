import { Button, ButtonLink } from '../components/Button.tsx';
import { ACTIVE_CHAIN } from '../config/network.ts';
import { shortAddress } from './format.ts';
import { NetworkBadge } from './NetworkBadge.tsx';
import { useWallet } from './useWallet.ts';
import { WalletMark } from './WalletMark.tsx';

/** The connected wallet: which one, its address, its network and a way out. */
export function AccountPanel() {
  const { wallet, address, isCorrectNetwork, disconnect } = useWallet();
  if (!wallet || !address) return null;

  return (
    <>
      <div className="wallet-account">
        <WalletMark wallet={wallet} />
        <div className="wallet-account__who">
          <p className="wallet-account__name">{wallet.name}</p>
          <p className="wallet-account__address" title={address}>
            {shortAddress(address)}
          </p>
        </div>
        <NetworkBadge correct={isCorrectNetwork} full />
      </div>
      <div className="wallet-dialog__actions">
        <ButtonLink
          variant="ghost"
          size="sm"
          glint={false}
          href={`${ACTIVE_CHAIN.explorerUrl}/address/${address}`}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer
        </ButtonLink>
        <Button variant="ghost" size="sm" glint={false} data-autofocus="" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      </div>
      <p className="wallet-dialog__note">
        Deploying opens when the network goes live on testnet. Nothing is sent on-chain from this page.
      </p>
    </>
  );
}

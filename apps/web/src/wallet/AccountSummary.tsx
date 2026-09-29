import { shortAddress } from './format.ts';
import { NetworkBadge } from './NetworkBadge.tsx';
import { useWallet } from './useWallet.ts';
import { WalletMark } from './WalletMark.tsx';

/** Which wallet is connected, its address and the network it is on. */
export function AccountSummary() {
  const { wallet, address, isCorrectNetwork } = useWallet();
  if (!wallet || !address) return null;

  return (
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
  );
}

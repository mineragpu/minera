import { WalletIcon } from '../components/icons.tsx';
import type { WalletOption } from './discovery.ts';

/** The icon a wallet announced for itself, or a generic one when it gave none. */
export function WalletMark({ wallet }: { wallet: WalletOption }) {
  if (!wallet.icon) return <WalletIcon className="wallet-mark wallet-mark--generic" />;
  return <img className="wallet-mark" src={wallet.icon} alt="" width={32} height={32} />;
}

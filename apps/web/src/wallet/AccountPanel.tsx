import { Button, ButtonLink } from '../components/Button.tsx';
import { ACTIVE_CHAIN } from '../config/network.ts';
import { AccountSummary } from './AccountSummary.tsx';
import { useWallet } from './useWallet.ts';

/** The connected wallet on the right network, with a way to inspect it and a way out. */
export function AccountPanel() {
  const { address, disconnect } = useWallet();
  if (!address) return null;

  return (
    <>
      <AccountSummary />
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

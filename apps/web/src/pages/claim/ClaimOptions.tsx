import type { Address, PairAsset } from '@dayagpu/shared';
import { Button } from '../../components/Button.tsx';
import { formatAmount } from '../../lib/amount.ts';
import { STOCK_PAIRS, type QuoteState } from './useClaimQuotes.ts';

interface ClaimOptionsProps {
  /** Null until the connected wallet's rewards are known. */
  claimable: bigint | null;
  /** A wallet is connected on the right network. */
  walletReady: boolean;
  quotes: ReadonlyMap<Address, QuoteState>;
  /** A claim is in flight, or the page is not ready to send one. */
  disabled: boolean;
  /** The option being claimed, while its transaction runs. */
  active: Address | 'eth' | null;
  onClaimEth: () => void;
  onClaimStock: (asset: PairAsset) => void;
}

function stockLine(asset: PairAsset, state: QuoteState | undefined, claimable: bigint | null): string {
  if (claimable === null || claimable === 0n) return 'A quote is fetched once there is something to claim.';
  if (!state || state.status === 'loading') return `Getting a ${asset.symbol} quote…`;
  if (state.status === 'failed') {
    return `A ${asset.symbol} quote is not available right now, so this option is off. Claiming in ETH always works.`;
  }
  const { amountOut, minOut } = state.quote;
  return `About ${formatAmount(amountOut, asset.decimals)} ${asset.symbol} at the current quote, and at least ${formatAmount(minOut, asset.decimals)} with 1% slippage.`;
}

export function ClaimOptions({ claimable, walletReady, quotes, disabled, active, onClaimEth, onClaimStock }: ClaimOptionsProps) {
  const nothing = claimable === null || claimable === 0n;
  let ethLine = 'Connect your wallet to see what it can claim.';
  if (walletReady && claimable === null) ethLine = 'Reading your rewards…';
  else if (claimable === 0n) ethLine = 'Nothing to claim yet.';
  else if (claimable !== null) ethLine = `${formatAmount(claimable)} ETH, paid straight to your wallet.`;
  return (
    <ul className="claim-options">
      <li>
        <div>
          <p className="claim-options__title">Claim in ETH</p>
          <p className="claim-options__line">{ethLine}</p>
        </div>
        <Button variant="primary" size="sm" disabled={disabled || nothing} aria-busy={active === 'eth'} onClick={onClaimEth}>
          Claim in ETH
        </Button>
      </li>
      {STOCK_PAIRS.map((asset) => {
        const state = quotes.get(asset.address);
        const ready = state?.status === 'ready';
        return (
          <li key={asset.address}>
            <div>
              <p className="claim-options__title">Claim as {asset.symbol}</p>
              <p className="claim-options__line">{stockLine(asset, state, claimable)}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              glint={false}
              disabled={disabled || nothing || !ready}
              aria-busy={active === asset.address}
              onClick={() => onClaimStock(asset)}
            >
              Claim as {asset.symbol}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

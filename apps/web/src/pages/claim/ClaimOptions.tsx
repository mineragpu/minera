import { ETH_PAIR, type Address, type PairAsset } from '@dayagpu/shared';
import { Button } from '../../components/Button.tsx';
import { RadioChip } from '../../components/RadioChip.tsx';
import { formatAmount } from '../../lib/amount.ts';
import { sameAddress } from './claimPlan.ts';
import type { QuoteState } from './useClaimQuotes.ts';
import '../../components/chip.css';

interface ClaimOptionsProps {
  /** The stock tokens on offer; ETH is always offered too. */
  stocks: readonly PairAsset[];
  /** The option listed first: the default. */
  first: Address;
  selected: Address | null;
  onSelect: (asset: Address) => void;
  /** Null until the connected wallet's rewards are known. */
  claimable: bigint | null;
  quotes: ReadonlyMap<Address, QuoteState>;
  /** The page is not ready to send a claim. */
  disabled: boolean;
  /** A claim is being priced or sent. */
  busy: boolean;
  onClaim: () => void;
}

function ethLine(claimable: bigint | null): string {
  if (claimable === null) return 'Reading your rewards…';
  if (claimable === 0n) return 'Nothing to claim yet.';
  return `${formatAmount(claimable)} ETH, paid straight to your wallet.`;
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

export function ClaimOptions(props: ClaimOptionsProps) {
  const { stocks, first, selected, onSelect, claimable, quotes, disabled, busy, onClaim } = props;
  const offered: Address[] = [ETH_PAIR, ...stocks.map((asset) => asset.address)];
  const order = [...offered].sort((a, b) => Number(sameAddress(b, first)) - Number(sameAddress(a, first)));
  const stock = selected === null ? undefined : stocks.find((asset) => sameAddress(asset.address, selected));
  const quote = stock ? quotes.get(stock.address) : undefined;
  const nothing = claimable === null || claimable === 0n;

  let line = 'Choose how to receive this claim.';
  let label = 'Claim';
  if (stock) {
    line = stockLine(stock, quote, claimable);
    label = `Claim in ${stock.symbol}`;
  } else if (selected !== null) {
    line = ethLine(claimable);
    label = 'Claim in ETH';
  }

  return (
    <div className="claim-options">
      <fieldset className="fieldset" disabled={busy}>
        <legend className="flabel">Pay this claim in</legend>
        <div className="chips">
          {order.map((address) => (
            <RadioChip
              key={address}
              id={`claim-in-${address}`}
              name="claim-in"
              value={address}
              checked={selected !== null && sameAddress(selected, address)}
              onSelect={onSelect}
              describedBy="claim-line"
            >
              {stocks.find((asset) => asset.address === address)?.symbol ?? 'ETH'}
            </RadioChip>
          ))}
        </div>
      </fieldset>
      <p className="claim-options__line" id="claim-line">
        {line}
      </p>
      <Button
        variant="primary"
        disabled={disabled || busy || nothing || selected === null || (stock !== undefined && quote?.status !== 'ready')}
        aria-busy={busy}
        onClick={onClaim}
      >
        {label}
      </Button>
    </div>
  );
}

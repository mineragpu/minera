import type { Address } from '@dayagpu/shared';
import { RadioChip } from '../../components/RadioChip.tsx';
import { PAIR_LISTING } from '../../config/contracts.ts';

interface PairStepProps {
  value: Address;
  onChange: (value: Address) => void;
  locked: boolean;
}

export function PairStep({ value, onChange, locked }: PairStepProps) {
  const hasStocks = PAIR_LISTING.assets.some((asset) => asset.kind === 'stock');
  return (
    <fieldset className="fieldset" disabled={locked}>
      <legend className="flabel">Pair with</legend>
      <div className="chips">
        {PAIR_LISTING.assets.map((asset) => (
          <RadioChip
            key={asset.address}
            id={`pair-${asset.address}`}
            name="pair"
            value={asset.address}
            checked={asset.address === value}
            onSelect={onChange}
            describedBy="pair-hint"
          >
            {asset.symbol}
          </RadioChip>
        ))}
      </div>
      <p className="hint" id="pair-hint">
        Claims default to this asset: a stock token is bought with the ETH when you claim. You can claim in ETH
        instead at any time.
      </p>
      {hasStocks && <p className="eligibility">Tokenized stocks are not available to US persons.</p>}
    </fieldset>
  );
}

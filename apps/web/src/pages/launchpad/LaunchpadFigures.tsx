import type { ApiError } from '../../api/errors.ts';
import type { NetworkView } from '../../api/schemas.ts';
import { LiveDot } from '../../components/LiveDot.tsx';
import { LoadError } from '../../components/LoadError.tsx';
import { Skeleton } from '../../components/Skeleton.tsx';
import { formatCount } from '../../lib/amount.ts';
import { EpochCountdown } from './EpochCountdown.tsx';

interface LaunchpadFiguresProps {
  network: NetworkView | null;
  error: ApiError | null;
  onRetry: () => void;
}

/** The network's live figures above the board, with the time left in the current epoch. */
export function LaunchpadFigures({ network, error, onRetry }: LaunchpadFiguresProps) {
  if (!network && error) {
    return (
      <div className="lp-figures lp-figures--error">
        <LoadError message={error.message} onRetry={onRetry} />
      </div>
    );
  }
  const skeleton = <Skeleton width="6ch" />;
  return (
    <div className="lp-figures" aria-busy={network === null}>
      <dl className="lp-figures__list">
        <div>
          <dt>
            <LiveDot />
            Rigs online
          </dt>
          <dd>
            {network ? (
              <>
                {formatCount(network.rigs.online)}
                <span className="lp-figures__unit"> of {formatCount(network.rigs.total)}</span>
              </>
            ) : (
              skeleton
            )}
          </dd>
        </div>
        <div>
          <dt>Verified work, 24 h</dt>
          <dd>
            {network ? (
              <>
                {formatCount(network.last24h.verifiedUnits)}
                <span className="lp-figures__unit"> units</span>
              </>
            ) : (
              skeleton
            )}
          </dd>
        </div>
        <div className="lp-figures__epoch">
          <dt>This epoch ends in</dt>
          <dd>{network ? <EpochCountdown epoch={network.epoch} onEnded={onRetry} /> : skeleton}</dd>
        </div>
      </dl>
    </div>
  );
}

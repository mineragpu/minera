import type { CSSProperties } from 'react';
import { fetchNetwork } from '../api/coordinator.ts';
import { usePoll } from '../api/usePoll.ts';
import { LoadError } from '../components/LoadError.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { formatAmount, formatCount } from '../lib/amount.ts';

const REFRESH_MS = 30_000;

/** The hero's three live readings of the network. */
export function NetworkFigures({ style }: { style: CSSProperties }) {
  const network = usePoll(fetchNetwork, { key: 'network', intervalMs: REFRESH_MS });
  const { data } = network;

  if (network.status === 'error' && network.error) {
    return (
      <div className="spec-error rise" style={style}>
        <LoadError message={network.error.message} onRetry={network.retry} />
      </div>
    );
  }

  const skeleton = <Skeleton width="7ch" />;
  return (
    <div className="rise" style={style}>
      <dl className="spec" aria-busy={data === null}>
        <div>
          <dt>Rigs online</dt>
          <dd>{data ? `${formatCount(data.rigs.online)} of ${formatCount(data.rigs.total)}` : skeleton}</dd>
        </div>
        <div>
          <dt>Verified, 24 h</dt>
          <dd>{data ? `${formatCount(data.last24h.verifiedUnits)} units` : skeleton}</dd>
        </div>
        <div>
          <dt>Burned in</dt>
          <dd>{data ? (data.pool ? `${formatAmount(data.pool.totalBurned)} ETH` : 'Not read yet') : skeleton}</dd>
        </div>
      </dl>
      <p className="spec__note">Live from the network, refreshed every 30 seconds.</p>
    </div>
  );
}

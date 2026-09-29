import { useState } from 'react';
import { fetchRigs } from '../api/coordinator.ts';
import type { RigSummary } from '../api/schemas.ts';
import { usePoll } from '../api/usePoll.ts';
import { ButtonLink } from '../components/Button.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { RigCard } from '../components/RigCard.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { formatCount } from '../lib/amount.ts';
import { pairLabel } from '../lib/pairLabel.ts';
import { PATHS } from '../router/routes.ts';
import './launchpad.css';

const REFRESH_MS = 30_000;
const PLACEHOLDER_CARDS = 3;

type Filter = 'all' | 'eth' | 'stock';

const FILTERS: readonly { value: Filter; label: string; empty: string }[] = [
  { value: 'all', label: 'All', empty: '' },
  { value: 'eth', label: 'ETH', empty: 'No rig is paired with ETH yet.' },
  { value: 'stock', label: 'Stock', empty: 'No rig is paired with a stock token yet.' },
];

function matches(filter: Filter, rig: RigSummary): boolean {
  if (filter === 'all') return true;
  return (pairLabel(rig.pair).kind === 'native') === (filter === 'eth');
}

function PlaceholderCard() {
  return (
    <div className="rig__card rig__card--placeholder">
      <Skeleton width="60%" height="1.4em" />
      <Skeleton width="40%" />
      <Skeleton width="100%" height="3.4em" />
      <Skeleton width="50%" />
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="board-empty">
      <p className="board-empty__title">No rigs are deployed yet.</p>
      <p>Run the node client on your GPU, then send one transaction from your wallet to put the first rig here.</p>
      <ButtonLink variant="primary" href={PATHS.deploy}>
        Deploy a rig
      </ButtonLink>
    </div>
  );
}

export function Launchpad({ index }: { index: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [announcement, setAnnouncement] = useState('');
  const board = usePoll(fetchRigs, { key: 'rigs', intervalMs: REFRESH_MS });
  const rigs = board.data?.rigs ?? [];
  const shown = rigs.filter((rig) => matches(filter, rig));
  const total = board.data?.total ?? 0;

  const choose = (next: Filter) => {
    setFilter(next);
    const count = rigs.filter((rig) => matches(next, rig)).length;
    setAnnouncement(`${count} ${count === 1 ? 'rig' : 'rigs'} shown`);
  };

  let content;
  if (board.status === 'error' && board.error) {
    content = <LoadError message={board.error.message} onRetry={board.retry} />;
  } else if (board.status === 'loading') {
    content = (
      <ul className="rigs" aria-busy="true">
        {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
          <li key={index} className="rig">
            <PlaceholderCard />
          </li>
        ))}
      </ul>
    );
  } else if (total === 0) {
    content = <EmptyBoard />;
  } else if (shown.length === 0) {
    content = <p className="board-note">{FILTERS.find((option) => option.value === filter)?.empty}</p>;
  } else {
    content = (
      <ul className="rigs">
        {shown.map((rig) => (
          <li key={rig.nodeKey} className="rig">
            <RigCard rig={rig} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="section shell" id="launchpad" aria-labelledby="board-title">
      <div className="board__head">
        <div>
          <Kicker index={index}>Launchpad</Kicker>
          <h2 className="h2" id="board-title">
            Rigs on the board.
          </h2>
          <p className="lede">
            Each deployed rig gets a card, the way a new token does. Its work figures come from the network’s own
            checks, never from the rig.
          </p>
        </div>
        <div className="tools">
          <div className="seg" role="group" aria-label="Filter rigs by pair">
            {FILTERS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => choose(value)}>
                {label}
              </button>
            ))}
          </div>
          <p className="board-count">
            {board.data ? `${formatCount(total)} deployed` : <Skeleton width="10ch" />}
          </p>
        </div>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>

      <div className="board">{content}</div>
      {board.data && total > rigs.length && (
        <p className="board-note">
          Showing the newest {formatCount(rigs.length)} of {formatCount(total)} rigs.
        </p>
      )}
    </section>
  );
}

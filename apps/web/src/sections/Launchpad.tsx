import { useState } from 'react';
import { fetchRigs } from '../api/coordinator.ts';
import type { RigSummary } from '../api/schemas.ts';
import { usePoll } from '../api/usePoll.ts';
import { Kicker } from '../components/Kicker.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { NoRigsYet } from '../components/NoRigsYet.tsx';
import { RigGrid } from '../components/RigGrid.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { formatCount } from '../lib/amount.ts';
import { pairLabel } from '../lib/pairLabel.ts';
import './launchpad.css';

const REFRESH_MS = 30_000;
const PLACEHOLDER_CARDS = 3;

type Filter = 'all' | 'eth' | 'stock';

function loadBoard(signal: AbortSignal) {
  return fetchRigs({ sort: 'new', pair: null, limit: 100, offset: 0 }, signal);
}

const FILTERS: readonly { value: Filter; label: string; empty: string }[] = [
  { value: 'all', label: 'All', empty: '' },
  { value: 'eth', label: 'ETH', empty: 'No rig is paired with ETH yet.' },
  { value: 'stock', label: 'Stock', empty: 'No rig is paired with a stock token yet.' },
];

function matches(filter: Filter, rig: RigSummary): boolean {
  if (filter === 'all') return true;
  return (pairLabel(rig.pair).kind === 'native') === (filter === 'eth');
}

export function Launchpad({ index }: { index: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [announcement, setAnnouncement] = useState('');
  const board = usePoll(loadBoard, { key: 'rigs', intervalMs: REFRESH_MS });
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
    content = <RigGrid rigs={null} placeholders={PLACEHOLDER_CARDS} />;
  } else if (total === 0) {
    content = <NoRigsYet />;
  } else if (shown.length === 0) {
    content = <p className="board-note">{FILTERS.find((option) => option.value === filter)?.empty}</p>;
  } else {
    content = <RigGrid rigs={shown} placeholders={PLACEHOLDER_CARDS} />;
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

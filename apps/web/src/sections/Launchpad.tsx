import { useState } from 'react';
import { Kicker } from '../components/Kicker.tsx';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { RigCard } from '../components/RigCard.tsx';
import { PREVIEW_RIGS, type Pair } from '../data/preview.ts';
import './launchpad.css';

type Filter = 'all' | Pair;

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'eth', label: 'ETH' },
  { value: 'stock', label: 'Stock' },
];

function matches(filter: Filter, pair: Pair): boolean {
  return filter === 'all' || filter === pair;
}

export function Launchpad() {
  const [filter, setFilter] = useState<Filter>('all');
  const [announcement, setAnnouncement] = useState('');
  const [backed, setBacked] = useState<ReadonlySet<string>>(() => new Set());

  const choose = (next: Filter) => {
    setFilter(next);
    const shown = PREVIEW_RIGS.filter((rig) => matches(next, rig.pair)).length;
    setAnnouncement(`${shown} rigs shown`);
  };

  const toggleBack = (id: string) => {
    setBacked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="section shell" id="launchpad" aria-labelledby="board-title">
      <div className="board__head">
        <div>
          <Kicker index="03">Launchpad</Kicker>
          <h2 className="h2" id="board-title">
            Rigs on the board.
          </h2>
          <p className="lede">
            Each deployed rig gets a card, the way a new token does. Holders can back the rigs they want to see
            mining.
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
          <PreviewTag />
        </div>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>

      <ul className="rigs">
        {PREVIEW_RIGS.map((rig) => (
          <li key={rig.id} className="rig" hidden={!matches(filter, rig.pair)} style={{ '--hue': rig.hue }}>
            <RigCard rig={rig} backed={backed.has(rig.id)} onToggleBack={toggleBack} />
          </li>
        ))}
      </ul>
    </section>
  );
}

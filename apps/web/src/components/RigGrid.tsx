import type { RigSummary } from '../api/schemas.ts';
import { revealRef } from '../motion/revealObserver.ts';
import { RigCard } from './RigCard.tsx';
import { Skeleton } from './Skeleton.tsx';
import './rig-card.css';
import './rig-grid.css';

interface RigGridProps {
  /** Null while the board loads; placeholder cards stand in until it arrives. */
  rigs: readonly RigSummary[] | null;
  placeholders: number;
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

/** Rig cards in a responsive grid, or their placeholders while loading. */
export function RigGrid({ rigs, placeholders }: RigGridProps) {
  if (rigs === null) {
    return (
      <ul className="rigs" aria-busy="true">
        {Array.from({ length: placeholders }, (_, index) => (
          <li key={index} className="rig" ref={revealRef} data-reveal="fade-up">
            <PlaceholderCard />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="rigs">
      {rigs.map((rig) => (
        <li key={rig.nodeKey} className="rig" ref={revealRef} data-reveal="fade-up">
          <RigCard rig={rig} />
        </li>
      ))}
    </ul>
  );
}

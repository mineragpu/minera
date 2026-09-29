import type { NetworkView } from '../../api/schemas.ts';
import { Skeleton } from '../../components/Skeleton.tsx';

const ORDERS: readonly { name: string; rule: string }[] = [
  { name: 'New', rule: 'The most recently deployed rigs first.' },
  {
    name: 'Top this epoch',
    rule: 'Verified units in the current epoch, then verified units over the rig’s life, then the newest.',
  },
  { name: 'Lifetime', rule: 'Verified units over the rig’s life, then the newest.' },
];

/** How the board is ordered, and what the figures on each card count. */
export function RankingNote({ rules }: { rules: NetworkView['rules'] | null }) {
  return (
    <section className="lp-note" aria-labelledby="lp-note-title">
      <h2 className="lp-note__title" id="lp-note-title">
        How rigs are ranked
      </h2>
      <dl className="lp-note__orders">
        {ORDERS.map((order) => (
          <div key={order.name}>
            <dt>{order.name}</dt>
            <dd>{order.rule}</dd>
          </div>
        ))}
      </dl>
      <div className="lp-note__units" aria-busy={rules === null}>
        <h3>What a verified unit is</h3>
        {rules ? (
          <>
            <p>{rules.units}</p>
            <p>{rules.verification}</p>
          </>
        ) : (
          <Skeleton width="100%" height="4em" />
        )}
        <p className="lp-note__source">
          The network service states these rules itself. Every figure on a card is counted by it, never reported by the
          rig. Retired rigs leave the board; each keeps its own page.
        </p>
      </div>
    </section>
  );
}

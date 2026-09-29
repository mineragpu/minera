import type { NetworkView } from '../api/schemas.ts';
import { Skeleton } from '../components/Skeleton.tsx';
import { formatCount } from '../lib/amount.ts';

/** Before a prompt is sent: how answers are checked and measured, in the coordinator's words. */
export function HowChecked({ network }: { network: NetworkView | null }) {
  const online = network?.rigs.online ?? null;
  return (
    <section className="job" aria-labelledby="how-checked-title" aria-busy={network === null}>
      <h3 className="job__title" id="how-checked-title">
        How answers are checked
      </h3>
      {network ? (
        <>
          <p className="job__rule">{network.rules.verification}</p>
          <p className="job__rule">{network.rules.units}</p>
        </>
      ) : (
        <Skeleton width="100%" height="4.5em" />
      )}
      {online !== null && (
        <p className="job__status">
          {online === 0
            ? 'No rigs are online right now, so a prompt waits in the queue until one connects.'
            : `${formatCount(online)} ${online === 1 ? 'rig is' : 'rigs are'} online now.`}
        </p>
      )}
    </section>
  );
}

import type { RigSummary } from '../api/schemas.ts';
import { formatCount } from '../lib/amount.ts';
import { pairLabel } from '../lib/pairLabel.ts';
import { rigHue } from '../lib/rigHue.ts';
import { timeFromNow } from '../lib/time.ts';
import { useSheenFollow } from '../motion/useSheenFollow.ts';
import { rigPath } from '../router/routes.ts';
import { CubeGlyph } from './CubeGlyph.tsx';
import { RigState } from './RigState.tsx';
import { SheenSpot } from './SheenSpot.tsx';
import './rig-card.css';

/** A rig on the launchpad board. The whole card links to the rig's page. */
export function RigCard({ rig }: { rig: RigSummary }) {
  const sheen = useSheenFollow<HTMLElement>();
  const titleId = `rig-${rig.nodeKey}`;
  const pair = pairLabel(rig.pair);

  return (
    <article ref={sheen} className="rig__card" aria-labelledby={titleId} style={{ '--hue': rigHue(rig.nodeKey) }}>
      <SheenSpot />
      <div className="rig__top">
        <CubeGlyph className="glyph" color={rigHue(rig.nodeKey)} />
        <div>
          <h3 className="rig__name" id={titleId}>
            <a href={rigPath(rig.nodeKey)}>{rig.name}</a>
          </h3>
          <p className="rig__meta">Deployed {timeFromNow(rig.deployedAt)}</p>
        </div>
        <span className={`badge badge--${pair.kind === 'native' ? 'eth' : 'stock'}`}>
          <span className="sr-only">Paired with </span>
          {pair.text}
        </span>
      </div>
      <dl className="rig__stats">
        <div>
          <dt>This epoch</dt>
          <dd>{formatCount(rig.verifiedUnits.epoch)} units</dd>
        </div>
        <div>
          <dt>Lifetime</dt>
          <dd>{formatCount(rig.verifiedUnits.lifetime)} units</dd>
        </div>
      </dl>
      <div className="rig__foot">
        <RigState online={rig.online} lastSeenAt={rig.lastSeenAt} />
        <span className="rig__checks">
          <b>{formatCount(rig.checks.failed)}</b> failed checks
        </span>
      </div>
    </article>
  );
}

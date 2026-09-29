import { Button } from './Button.tsx';
import { CubeGlyph } from './CubeGlyph.tsx';
import { Sparkline } from './Sparkline.tsx';
import { CheckIcon } from './icons.tsx';
import type { RigPreview } from '../data/preview.ts';
import { formatNumber } from '../lib/format.ts';
import { useSheenFollow } from '../motion/useSheenFollow.ts';
import './rig-card.css';

interface RigCardProps {
  rig: RigPreview;
  backed: boolean;
  onToggleBack: (id: string) => void;
}

export function RigCard({ rig, backed, onToggleBack }: RigCardProps) {
  const sheen = useSheenFollow<HTMLElement>();
  const titleId = `rig-${rig.id}`;
  const unit = rig.pair === 'eth' ? 'ETH' : 'STOCK';

  return (
    <article ref={sheen} className="rig__card" aria-labelledby={titleId}>
      <div className="rig__top">
        <CubeGlyph className="glyph" color={rig.glyph} />
        <div>
          <h3 className="rig__name" id={titleId}>
            {rig.name}
          </h3>
          <p className="rig__meta">Deployed {rig.deployedDaysAgo} days ago</p>
        </div>
        <span className={`badge badge--${rig.pair}`}>
          <span className="sr-only">Paired with </span>
          {unit}
        </span>
      </div>
      <dl className="rig__stats">
        <div>
          <dt>VRAM</dt>
          <dd>{rig.vramGb} GB</dd>
        </div>
        <div>
          <dt>Verified work</dt>
          <dd>{formatNumber(rig.verifiedUnits, 0)} units</dd>
        </div>
      </dl>
      <div className="rig__earned">
        <span className="rig__label">Earned this campaign</span>
        <span className="rig__value">
          {rig.earned} <small>{unit}</small>
        </span>
      </div>
      <div className="rig__uptime">
        <Sparkline values={rig.uptimeHourly} />
        <span>
          <b>{rig.uptimePercent}%</b> uptime
        </span>
      </div>
      <div className="rig__foot">
        <Button variant="ghost" size="sm" className="btn--back" aria-pressed={backed} onClick={() => onToggleBack(rig.id)}>
          <CheckIcon className="ck" />
          Back this rig<span className="sr-only">: {rig.name}</span>
        </Button>
        <span className="rig__backers">
          <b>{rig.backers + (backed ? 1 : 0)}</b> backers
        </span>
      </div>
    </article>
  );
}

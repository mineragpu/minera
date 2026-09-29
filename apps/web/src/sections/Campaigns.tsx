import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { PREVIEW_CAMPAIGN } from '../data/preview.ts';
import './campaigns.css';

const LATER_CAMPAIGNS = ['02', '03'] as const;

export function Campaigns() {
  return (
    <section className="section shell" id="campaigns" aria-labelledby="camp-title">
      <div className="split-head">
        <div>
          <Kicker index="06">Campaigns</Kicker>
          <h2 className="h2" id="camp-title">
            Each campaign sets the share.
          </h2>
        </div>
        <p className="lede">
          A campaign announces what share of creator fees goes into the Burn Pool. The first one opens with the network on testnet.
        </p>
      </div>
      <ol className="timeline">
        <li className="camp camp--live">
          <span className="camp__node" aria-hidden="true">
            <CubeGlyph color="var(--teal)" />
          </span>
          <p className="camp__idx">Campaign {PREVIEW_CAMPAIGN.number}</p>
          <h3>{PREVIEW_CAMPAIGN.name}</h3>
          <p className="camp__state">Opens on testnet</p>
          <p className="camp__share">
            <strong>{PREVIEW_CAMPAIGN.poolSharePercent}%</strong>
            <span>of creator fees burned to the pool</span>
          </p>
          <div className="camp__foot">
            <span>Rewards paid each block</span>
            <PreviewTag />
          </div>
        </li>
        {LATER_CAMPAIGNS.map((number) => (
          <li key={number} className="camp camp--later">
            <span className="camp__node" aria-hidden="true">
              <CubeGlyph color="var(--muted)" />
            </span>
            <p className="camp__idx">Campaign {number}</p>
            <h3>Announced later</h3>
            <p>The pool share is set when the campaign is announced.</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { BRAND } from '@minera/shared';
import { PREVIEW_CAMPAIGN } from '../data/preview.ts';
import './campaigns.css';

const LATER_CAMPAIGNS = ['02', '03'] as const;

export function Campaigns({ index }: { index: string }) {
  return (
    <section className="section shell" id="campaigns" aria-labelledby="camp-title">
      <div className="split-head">
        <div>
          <Kicker index={index}>Campaigns</Kicker>
          <h2 className="h2" id="camp-title">
            Each campaign is announced.
          </h2>
        </div>
        <p className="lede">
          {BRAND.rewardAllocation} Every burn carries its campaign id on chain. The first campaign opens with the network on testnet.
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
            <span>Burned into the pool from the project wallet</span>
          </p>
          <div className="camp__foot">
            <span>Rewards paid each block</span>
          </div>
        </li>
        {LATER_CAMPAIGNS.map((number) => (
          <li key={number} className="camp camp--later">
            <span className="camp__node" aria-hidden="true">
              <CubeGlyph color="var(--muted)" />
            </span>
            <p className="camp__idx">Campaign {number}</p>
            <h3>Announced later</h3>
            <p>Announced with its schedule before it opens.</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { Words } from '../components/Words.tsx';
import { BRAND } from '@minera/shared';
import { ON_MAINNET } from '../config/network.ts';
import { PREVIEW_CAMPAIGN, REFILL_CAMPAIGN } from '../data/preview.ts';
import { useMergedRef } from '../lib/useMergedRef.ts';
import { loopRef } from '../motion/loopGate.ts';
import { revealRef } from '../motion/revealObserver.ts';
import './campaigns.css';

/** On mainnet, campaign 2 is live: the daily refills. */
const LATER_CAMPAIGNS = ON_MAINNET ? (['03'] as const) : (['02', '03'] as const);

export function Campaigns({ index }: { index: string }) {
  const timelineRef = useMergedRef<HTMLOListElement>(loopRef, revealRef);
  return (
    <section className="section shell" id="campaigns" aria-labelledby="camp-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Campaigns</Kicker>
          <h2 className="h2" id="camp-title">
            <Words>Each campaign is announced.</Words>
          </h2>
        </div>
        <p className="lede">
          {BRAND.rewardAllocation} Every burn carries its campaign id on chain.{' '}
          {ON_MAINNET
            ? 'The first campaign opened on mainnet with the first burn into the Burn Pool, and the second tops it up every day.'
            : 'The first campaign opens with the network on testnet.'}
        </p>
      </div>
      <ol className="timeline" ref={timelineRef} data-reveal="timeline">
        <li className="camp camp--live" ref={revealRef} data-reveal="fade-up">
          <span className="camp__node" aria-hidden="true">
            <CubeGlyph color="var(--teal)" />
          </span>
          <p className="camp__idx">Campaign {PREVIEW_CAMPAIGN.number}</p>
          <h3>{PREVIEW_CAMPAIGN.name}</h3>
          <p className="camp__state">{ON_MAINNET ? 'Opened the mainnet pool' : 'Opens on testnet'}</p>
          <p className="camp__share">
            <span>Burned into the pool from the project wallet</span>
          </p>
          <div className="camp__foot">
            <span>Rewards paid each block</span>
          </div>
        </li>
        {ON_MAINNET && (
          <li className="camp camp--live" ref={revealRef} data-reveal="fade-up">
            <span className="camp__node" aria-hidden="true">
              <CubeGlyph color="var(--teal)" />
            </span>
            <p className="camp__idx">Campaign {REFILL_CAMPAIGN.number}</p>
            <h3>{REFILL_CAMPAIGN.name}</h3>
            <p className="camp__state">Live on mainnet</p>
            <p className="camp__share">
              <span>Burned into the pool every day from a dedicated refill wallet</span>
            </p>
            <div className="camp__foot">
              <span>Every top-up on chain</span>
            </div>
          </li>
        )}
        {LATER_CAMPAIGNS.map((number) => (
          <li key={number} className="camp camp--later" ref={revealRef} data-reveal="fade-up">
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

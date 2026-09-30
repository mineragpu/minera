import { Kicker } from '../components/Kicker.tsx';
import { SheenSpot } from '../components/SheenSpot.tsx';
import { Words } from '../components/Words.tsx';
import { PAIR_LISTING } from '../config/contracts.ts';
import { ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { loopRef } from '../motion/loopGate.ts';
import { revealRef } from '../motion/revealObserver.ts';
import { useSheenFollow } from '../motion/useSheenFollow.ts';
import '../components/form.css';
import '../components/rig-card.css';
import './pair-with.css';

interface Station {
  where: string;
  title: string;
  body: string;
}

const CLAIM_ETH: Station = {
  where: 'Burn Pool',
  title: 'Claim in ETH',
  body: 'The pool pays out the ETH your rigs have earned.',
};

const ETH_DELIVERED: Station = {
  where: 'Your wallet',
  title: 'ETH, delivered',
  body: 'Paid straight to you, with no swap and no quote.',
};

const CLAIM_VIA_ZAP: Station = {
  where: 'Burn Pool',
  title: 'Claim through the zap',
  body: 'Only your own wallet can claim this way, for itself.',
};

const SWAP: Station = {
  where: 'Pair zap',
  title: 'Swap',
  body: 'Buys the stock token with that ETH on a route fixed at deployment, at no less than your claim’s minimum.',
};

const STOCK_DELIVERED: Station = {
  where: 'Your wallet',
  title: 'Stock token, delivered',
  body: 'If the swap cannot meet the minimum, the claim reverts and nothing moves.',
};

interface StationCardProps {
  station: Station;
  /** Its place in the lane, for the entrance. */
  part: number;
  /** The zap flashes as it swaps; the end of a lane flashes as the token lands. */
  role?: 'zap' | 'end';
}

function StationCard({ station, part, role }: StationCardProps) {
  const sheen = useSheenFollow<HTMLLIElement>();
  return (
    <li ref={sheen} className={role ? `station station--${role}` : 'station'} style={{ '--part': part }}>
      <SheenSpot />
      <p className="station__where">{station.where}</p>
      <p className="station__title">{station.title}</p>
      <p className="station__body">{station.body}</p>
    </li>
  );
}

interface PipeProps {
  /** What travels along it while the diagram plays. */
  token: 'eth' | 'stock';
  /** When its token sets off, as a share of the loop. */
  leg: number;
  part: number;
  label?: string;
}

function Pipe({ token, leg, part, label }: PipeProps) {
  return (
    <li className={label ? 'pipe pipe--long' : 'pipe'} aria-hidden="true" style={{ '--part': part, '--leg': leg }}>
      <span className="pipe__line" />
      <span className={`pipe__run pipe__run--${token}`}>
        <i className="pipe__token" />
      </span>
      {label && <span className="pipe__label">{label}</span>}
    </li>
  );
}

export function PairWith({ index }: { index: string }) {
  const hasStocks = PAIR_LISTING.assets.some((asset) => asset.kind === 'stock');

  return (
    <section className="section shell" id="pair-with" aria-labelledby="pair-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Pair with</Kicker>
          <h2 className="h2" id="pair-title">
            <Words>Claim in your pair, or in ETH.</Words>
          </h2>
        </div>
        <p className="lede">
          A rig’s pair sets the asset your claims default to. Rewards are committed in ETH. When the pair is a listed
          stock token, the pair zap buys it with that ETH as you claim. You can claim in ETH instead at any time.
        </p>
      </div>

      <div className="pair-flow section-body" ref={loopRef}>
        <div className="pair-lane pair-lane--eth" ref={revealRef} data-reveal="lane">
          <p className="pair-lane__label">ETH</p>
          <ol className="pair-lane__steps" aria-label="Claiming in ETH">
            <StationCard station={CLAIM_ETH} part={0} />
            <Pipe token="eth" leg={0.5} part={1} label="No swap" />
            <StationCard station={ETH_DELIVERED} part={2} role="end" />
          </ol>
        </div>
        <div className="pair-lane pair-lane--stock" ref={revealRef} data-reveal="lane">
          <p className="pair-lane__label">Stock token</p>
          <ol className="pair-lane__steps" aria-label="Claiming as a stock token">
            <StationCard station={CLAIM_VIA_ZAP} part={0} />
            <Pipe token="eth" leg={0} part={1} />
            <StationCard station={SWAP} part={2} role="zap" />
            <Pipe token="stock" leg={0.34} part={3} />
            <StationCard station={STOCK_DELIVERED} part={4} role="end" />
          </ol>
        </div>
      </div>

      <div className="pair-notes">
        <div className="pair-note" ref={revealRef} data-reveal="fade-up">
          <p className="pair-note__title">ETH always works.</p>
          <p>A claim in ETH needs no swap, no quote and no listing, so it is always there to fall back on.</p>
        </div>
        <div className="pair-note" ref={revealRef} data-reveal="fade-up">
          <p className="pair-note__title">Blocked, or market paused?</p>
          <p>
            A stock token’s issuer can block a wallet or pause its market. The zap checks both before it swaps, so the
            claim fails without a swap and your rewards stay claimable in ETH.
          </p>
        </div>
        <div className="pair-note" ref={revealRef} data-reveal="fade-up">
          <p className="pair-note__title">Listed on {ACTIVE_NETWORK_LABEL.toLowerCase()}</p>
          <ul className="pair-assets" aria-label="Assets a rig can pair with">
            {PAIR_LISTING.assets.map((asset) => (
              <li key={asset.address} className={`badge badge--${asset.kind === 'native' ? 'eth' : 'stock'}`}>
                {asset.symbol}
              </li>
            ))}
          </ul>
          {hasStocks && <p className="eligibility">Tokenized stocks are not available to US persons.</p>}
        </div>
      </div>
    </section>
  );
}

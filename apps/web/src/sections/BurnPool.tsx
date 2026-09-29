import { useRef } from 'react';
import { CountUp } from '../components/CountUp.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { LiveDot } from '../components/LiveDot.tsx';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { Vessel } from '../components/vessel/Vessel.tsx';
import { PREVIEW_CAMPAIGN, PREVIEW_POOL } from '../data/preview.ts';
import { formatNumber } from '../lib/format.ts';
import { useVesselFill } from '../motion/useVesselFill.ts';
import './burn-pool.css';

function eth(value: number): string {
  return `${formatNumber(value, 2)} ETH`;
}

export function BurnPool() {
  const vesselRef = useRef<HTMLElement>(null);
  const { playing, onScreen } = useVesselFill(vesselRef);
  const { balanceEth, paidEth, depositedEth, depositCount } = PREVIEW_POOL;

  return (
    <section className="section shell" id="burn-pool" aria-labelledby="pool-title">
      <div className="pool">
        <div className="pool__head">
          <Kicker index="02">Burn Pool</Kicker>
          <h2 className="h2" id="pool-title">
            A pool that only fills.
          </h2>
          <p className="lede">
            The project wallet can add to the Burn Pool at any time. Every deposit is one-way. Nothing in the
            pool can be taken back out.
          </p>
        </div>

        <figure
          className={playing ? 'vessel play' : 'vessel'}
          ref={vesselRef}
          data-idle={onScreen ? undefined : ''}
        >
          <Vessel balanceEth={balanceEth} paidEth={paidEth} depositedEth={depositedEth} />
          <figcaption>
            <ul className="legend">
              <li>
                <span className="sw sw--fill" aria-hidden="true" />
                <span>In the pool</span>
                <span className="num">{eth(balanceEth)}</span>
              </li>
              <li>
                <span className="sw sw--hatch" aria-hidden="true" />
                <span>Paid to miners</span>
                <span className="num">{eth(paidEth)}</span>
              </li>
              <li>
                <span className="sw sw--line" aria-hidden="true" />
                <span>All deposits, {depositCount} in total</span>
                <span className="num">{eth(depositedEth)}</span>
              </li>
            </ul>
            <p className="legend__foot">
              <span>One slab = 1 ETH.</span>
              <PreviewTag />
            </p>
          </figcaption>
        </figure>

        <div className="pool__body">
          <p className="band">
            <LiveDot />
            <span>
              <b>
                Campaign {PREVIEW_CAMPAIGN.number} · {PREVIEW_CAMPAIGN.name}
              </b>{' '}
              — {PREVIEW_CAMPAIGN.poolSharePercent}% of creator fees burned to the pool
            </span>
          </p>

          <div className="readout">
            <div className="readout__top">
              <p className="rlabel">Pool balance</p>
              <PreviewTag />
            </div>
            <p className="big">
              <CountUp value={balanceEth} decimals={2} run={playing} />
              <span className="unit">ETH</span>
            </p>
            <div className="readout__row">
              <div>
                <p className="rlabel">Deposits burned in</p>
                <p className="mid">
                  <CountUp value={depositCount} decimals={0} run={playing} />
                </p>
              </div>
              <div>
                <p className="rlabel">Paid to miners</p>
                <p className="mid">
                  <CountUp value={paidEth} decimals={2} run={playing} /> <span className="unit">ETH</span>
                </p>
              </div>
            </div>
          </div>

          <p className="oneway">
            No withdraw function. <span>Deposits leave only as mining rewards.</span>
          </p>

          <ul className="iface" aria-label="What the Burn Pool can do">
            <li>
              <code>deposit</code>
              <span>From the project wallet, at any time</span>
              <span className="state state--open">Open</span>
            </li>
            <li>
              <code>reward</code>
              <span>To rigs, for verified work, each block</span>
              <span className="state state--open">Open</span>
            </li>
            <li className="is-none">
              <code>withdraw</code>
              <span>No such function</span>
              <span className="state state--none">None</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

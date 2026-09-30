import { useRef } from 'react';
import { BRAND } from '@minera/shared';
import { fetchPool } from '../api/coordinator.ts';
import type { PoolView } from '../api/schemas.ts';
import { usePoll } from '../api/usePoll.ts';
import { CountUp } from '../components/CountUp.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { formatScale, slabUnit } from '../components/vessel/scale.ts';
import { Vessel } from '../components/vessel/Vessel.tsx';
import { Words } from '../components/Words.tsx';
import { PREVIEW_CAMPAIGN } from '../data/preview.ts';
import { formatAmount, formatCount, toFloat } from '../lib/amount.ts';
import { revealRef } from '../motion/revealObserver.ts';
import { useVesselFill } from '../motion/useVesselFill.ts';
import './burn-pool.css';

const REFRESH_MS = 30_000;

type PoolState = NonNullable<PoolView['state']>;

interface PoolFigures {
  deposited: bigint;
  committed: bigint;
  uncommitted: bigint;
  settlements: number;
  block: bigint;
}

function figuresOf(state: PoolState): PoolFigures {
  return {
    deposited: state.totalBurned,
    committed: state.committed,
    uncommitted: state.totalBurned - state.committed,
    settlements: state.settlementCount,
    block: state.asOf.block,
  };
}

const EMPTY: PoolFigures = { deposited: 0n, committed: 0n, uncommitted: 0n, settlements: 0, block: 0n };

function level(value: bigint) {
  return { eth: toFloat(value), text: formatAmount(value) };
}

export function BurnPool({ index }: { index: string }) {
  const vesselRef = useRef<HTMLElement>(null);
  const { playing, onScreen } = useVesselFill(vesselRef);
  const pool = usePoll(fetchPool, { key: 'pool', intervalMs: REFRESH_MS });
  const state = pool.data?.state ?? null;
  const figures = state ? figuresOf(state) : EMPTY;
  const loading = pool.status === 'loading';
  const unit = slabUnit(toFloat(figures.deposited));
  const unitText = formatScale(unit, unit);
  const eth = (value: bigint) => (loading ? <Skeleton width="8ch" /> : `${formatAmount(value)} ETH`);

  return (
    <section className="section shell" id="burn-pool" aria-labelledby="pool-title">
      <div className="pool">
        <div className="pool__head" ref={revealRef} data-reveal="head">
          <Kicker index={index}>Burn Pool</Kicker>
          <h2 className="h2" id="pool-title">
            <Words>A pool that only fills.</Words>
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
          aria-busy={loading}
        >
          <Vessel
            uncommitted={level(figures.uncommitted)}
            committed={level(figures.committed)}
            deposited={level(figures.deposited)}
            unitEth={unit}
            unitText={unitText}
          />
          <figcaption>
            <ul className="legend">
              <li>
                <span className="sw sw--fill" aria-hidden="true" />
                <span>Not yet committed</span>
                <span className="num">{eth(figures.uncommitted)}</span>
              </li>
              <li>
                <span className="sw sw--hatch" aria-hidden="true" />
                <span>Committed to miners</span>
                <span className="num">{eth(figures.committed)}</span>
              </li>
              <li>
                <span className="sw sw--line" aria-hidden="true" />
                <span>All deposits</span>
                <span className="num">{eth(figures.deposited)}</span>
              </li>
            </ul>
            <p className="legend__foot">
              <span>One slab = {unitText} ETH.</span>
            </p>
          </figcaption>
        </figure>

        <div className="pool__body">
          <p className="band">
            <span>
              <b>
                Campaign {PREVIEW_CAMPAIGN.number} · {PREVIEW_CAMPAIGN.name}.
              </b>{' '}
              {BRAND.rewardAllocation} On testnet the project wallet burns into the pool directly.
            </span>
          </p>

          {pool.status === 'error' && pool.error ? (
            <div className="readout-error">
              <LoadError message={pool.error.message} onRetry={pool.retry} />
            </div>
          ) : (
            <div className="readout" aria-busy={loading}>
              <p className="rlabel">Burned in, all time</p>
              <p className="big">
                {loading ? (
                  <Skeleton width="4ch" />
                ) : (
                  <CountUp value={toFloat(figures.deposited)} text={formatAmount(figures.deposited)} run={playing} />
                )}
                <span className="unit">ETH</span>
              </p>
              <div className="readout__row">
                <div>
                  <p className="rlabel">Committed to miners</p>
                  <p className="mid">
                    {loading ? (
                      <Skeleton width="4ch" />
                    ) : (
                      <CountUp value={toFloat(figures.committed)} text={formatAmount(figures.committed)} run={playing} />
                    )}{' '}
                    <span className="unit">ETH</span>
                  </p>
                </div>
                <div>
                  <p className="rlabel">Settlements published</p>
                  <p className="mid">
                    {loading ? (
                      <Skeleton width="2ch" />
                    ) : (
                      <CountUp value={figures.settlements} text={formatCount(figures.settlements)} run={playing} />
                    )}
                  </p>
                </div>
              </div>
              <p className="readout__foot">
                {loading
                  ? 'Reading the pool…'
                  : state
                    ? `Read from the chain at block ${formatCount(figures.block)}.`
                    : 'The network has not read the pool from the chain yet.'}
              </p>
            </div>
          )}

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

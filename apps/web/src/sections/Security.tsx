import type { ReactNode } from 'react';
import { fetchPool } from '../api/coordinator.ts';
import { usePoll } from '../api/usePoll.ts';
import { Kicker } from '../components/Kicker.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { docPath } from '../pages/docs/manifest.ts';
import './security.css';

const REFRESH_MS = 120_000;

const UNITS: readonly [seconds: number, name: string][] = [
  [86_400, 'day'],
  [3_600, 'hour'],
  [60, 'minute'],
  [1, 'second'],
];

/** A whole duration in its largest exact unit: "30 minutes", "12 hours". */
function duration(seconds: bigint): string {
  const total = Number(seconds);
  const [size, name] = UNITS.find(([unit]) => total % unit === 0) ?? [1, 'second'];
  const count = total / size;
  return `${count} ${name}${count === 1 ? '' : 's'}`;
}

interface Point {
  title: string;
  body: ReactNode;
}

function PointList({ points }: { points: readonly Point[] }) {
  return (
    <ul className="trust__points">
      {points.map((point) => (
        <li key={point.title}>
          <h4>{point.title}</h4>
          <p>{point.body}</p>
        </li>
      ))}
    </ul>
  );
}

const DEPENDS_ON: readonly Point[] = [
  {
    title: 'The publisher key',
    body: 'One key publishes each settlement. A wrong one is bounded by the release limit and can be vetoed during the challenge delay. Replacing the key waits out a public delay.',
  },
  {
    title: 'The guardian',
    body: 'One key can veto a settlement during its challenge delay, list pairs, allow or remove a zap and propose a new publisher. It has no path to the funds. On testnet it is a single key held by the project.',
  },
  {
    title: 'The coordinator',
    body: 'The network service measures work, checks answers and builds each settlement. Each settlement’s inputs are published so anyone can recompute it; today the service itself serves them.',
  },
  {
    title: 'The chain',
    body: 'The chain orders transactions through a single sequencer, and its own core contracts can be upgraded by its operators. Everything built on it inherits both.',
  },
];

export function Security({ index }: { index: string }) {
  const pool = usePoll(fetchPool, { key: 'pool', intervalMs: REFRESH_MS });
  const state = pool.data?.state ?? null;
  const loading = pool.status === 'loading';

  let releaseLimit: ReactNode = 'a fixed share';
  let challengeDelay: ReactNode = 'a fixed delay';
  if (loading) {
    releaseLimit = <Skeleton width="3ch" />;
    challengeDelay = <Skeleton width="9ch" />;
  } else if (state) {
    releaseLimit = `${Number(state.releaseBpsPerDay) / 100}%`;
    challengeDelay = duration(state.challengeDelaySeconds);
  }

  const enforced: readonly Point[] = [
    {
      title: 'No withdraw',
      body: 'The Burn Pool has no withdraw, sweep or owner function. ETH leaves it only through a claim against a published settlement.',
    },
    {
      title: 'A release limit',
      body: (
        <>
          A settlement can commit at most {releaseLimit} of the uncommitted balance per day since the last settlement.
        </>
      ),
    },
    {
      title: 'A challenge delay',
      body: (
        <>A settlement becomes claimable {challengeDelay} after it is published. Until then the guardian can veto it.</>
      ),
    },
    {
      title: 'Claims capped by the settlement',
      body: 'Claims under a settlement can never add up to more than the total it commits, and each new total must be at least the last.',
    },
    {
      title: 'No upgrades',
      body: 'The contracts have no proxy and no upgrade path. The code that is deployed is the code that runs.',
    },
  ];

  return (
    <section className="section shell" id="security" aria-labelledby="security-title">
      <div className="split-head">
        <div>
          <Kicker index={index}>Security and trust</Kicker>
          <h2 className="h2" id="security-title">
            What the code enforces, and what it trusts.
          </h2>
        </div>
        <p className="lede">
          Some guarantees are enforced by the contracts. Others depend on keys, and on people running services. Both are
          listed here.
        </p>
      </div>

      <div className="trust section-body">
        <div className="trust__col trust__col--enforced" aria-busy={loading}>
          <h3 className="trust__head">
            <span className="trust__tag">Enforced</span>
            By the contracts
          </h3>
          <PointList points={enforced} />
          {state && (
            <p className="trust__foot">Limits read from the Burn Pool on the chain, through the network service.</p>
          )}
        </div>
        <div className="trust__col trust__col--trusted">
          <h3 className="trust__head">
            <span className="trust__tag">Trusted</span>
            Keys and operators
          </h3>
          <PointList points={DEPENDS_ON} />
        </div>
      </div>

      <p className="trust__audit">
        <b>Not audited yet</b> The contracts have not had an external audit. Their source is verified against the
        deployed code.{' '}
        <a className="text-link" href={docPath('security')}>
          Read the security notes
        </a>
      </p>
    </section>
  );
}

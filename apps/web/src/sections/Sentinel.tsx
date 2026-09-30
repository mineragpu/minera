import type { ReactNode } from 'react';
import { SENTINEL_GATES, type RigStanding, type SentinelGate } from '@minera/shared';
import { fetchSentinel } from '../api/coordinator.ts';
import type { ApiError } from '../api/errors.ts';
import type { SentinelView } from '../api/schemas.ts';
import { usePoll } from '../api/usePoll.ts';
import { Kicker } from '../components/Kicker.tsx';
import { LiveDot } from '../components/LiveDot.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Words } from '../components/Words.tsx';
import { SentinelTunnel } from '../components/sentinel/SentinelTunnel.tsx';
import { formatCount } from '../lib/amount.ts';
import { formatDateTime } from '../lib/time.ts';
import { revealRef } from '../motion/revealObserver.ts';
import './sentinel.css';

const REFRESH_MS = 30_000;

interface GateCopy {
  title: string;
  body: string;
}

const GATES: Readonly<Record<SentinelGate, GateCopy>> = {
  identity: {
    title: 'Identity',
    body: 'Every node request is signed by the rig’s node key, bound to one chain and carries a one-time nonce. A request budget per key and a cooldown on hello mean a script can neither flood the coordinator nor reset its own checks.',
  },
  gpu: {
    title: 'Proof of GPU',
    body: 'The coordinator times every answer itself. A rig must hold a minimum generation speed on the network’s model, one that CPU scripts do not reach. Reported hardware is never trusted.',
  },
  canary: {
    title: 'Canary checks',
    body: 'Known-answer checks arrive as ordinary chat jobs at random times. A rig cannot tell a check from paid work, and a check left unanswered counts as a miss.',
  },
  crosscheck: {
    title: 'Cross-check',
    body: 'Copies of a job go to rigs that share no operator, no network and no GPU. When two answers disagree, a third rig breaks the tie, and only the losing side takes a strike.',
  },
  reputation: {
    title: 'Reputation',
    body: 'New rigs start on probation and earn at half rate until they pass five canaries. Repeated strikes put a rig in quarantine: no work, and its work in that epoch earns nothing.',
  },
};

const STANDINGS: readonly { standing: RigStanding; label: string; body: string }[] = [
  { standing: 'trusted', label: 'Trusted', body: 'Five canaries passed. Earns at the full rate.' },
  { standing: 'probation', label: 'Probation', body: 'New rigs. Earns at half rate until five canaries pass.' },
  { standing: 'quarantined', label: 'Quarantined', body: 'Repeated strikes. No work, and nothing earned that epoch.' },
];

/** The route answers 404 until the coordinator serves it; say so plainly instead of naming a route. */
function errorMessage(error: ApiError): string {
  return error.status === 404 ? 'Live Sentinel figures are not available yet.' : error.message;
}

function gateStats(data: SentinelView | null, gate: SentinelGate): { passed: number; blocked: number } | null {
  return data?.gates.find((entry) => entry.gate === gate) ?? null;
}

function totals(data: SentinelView): { passed: number; blocked: number } {
  return data.gates.reduce(
    (sum, entry) => ({ passed: sum.passed + entry.passed, blocked: sum.blocked + entry.blocked }),
    { passed: 0, blocked: 0 },
  );
}

/** A placeholder while loading, the figure once it arrives, and nothing once loading has failed. */
function reading(loading: boolean, value: number | undefined, width = '3ch'): ReactNode {
  if (loading) return <Skeleton width={width} />;
  return value === undefined ? null : formatCount(value);
}

interface LiveProps {
  data: SentinelView | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

function LivePanel({ data, loading, error, onRetry }: LiveProps) {
  const sum = data ? totals(data) : null;
  const rigs = data ? STANDINGS.reduce((count, { standing }) => count + data.standing[standing], 0) : 0;

  return (
    <aside
      className="sentinel__live"
      ref={revealRef}
      data-reveal="slide-r"
      aria-labelledby="sentinel-live-title"
      aria-busy={loading}
    >
      <h3 className="sentinel__live-title" id="sentinel-live-title">
        <LiveDot />
        Sentinel now
      </h3>

      {error && !data ? (
        <div className="sentinel__error">
          <LoadError message={errorMessage(error)} onRetry={onRetry} />
        </div>
      ) : (
        <dl className="sentinel__totals">
          <div className="sentinel__total">
            <dt>
              <span className="sentinel-sw sentinel-sw--blocked" aria-hidden="true" />
              Blocked, 24 h
            </dt>
            <dd>{reading(loading, sum?.blocked, '4ch')}</dd>
          </div>
          <div className="sentinel__total">
            <dt>
              <span className="sentinel-sw sentinel-sw--passed" aria-hidden="true" />
              Passed, 24 h
            </dt>
            <dd>{reading(loading, sum?.passed, '5ch')}</dd>
          </div>
        </dl>
      )}

      <div>
        <h4 className="sentinel__sub">Rigs by standing</h4>
        {data && (
          <div className="standing-bar" aria-hidden="true">
            {rigs > 0 &&
              STANDINGS.map(({ standing }) => (
                <span
                  key={standing}
                  className={`standing-bar__part standing-bar__part--${standing}`}
                  style={{ flexGrow: data.standing[standing] }}
                />
              ))}
          </div>
        )}
        <ul className="standings">
          {STANDINGS.map(({ standing, label, body }) => (
            <li key={standing} className="standing">
              <span className={`sentinel-sw sentinel-sw--${standing}`} aria-hidden="true" />
              <span className="standing__name">{label}</span>
              <span className="standing__count">{reading(loading, data?.standing[standing])}</span>
              <p className="standing__body">{body}</p>
            </li>
          ))}
        </ul>
      </div>

      {data && (
        <p className="sentinel__asof">
          Passed and blocked count each gate’s decisions in the 24 hours to {formatDateTime(data.asOf)}. Refreshed
          every 30 seconds.
        </p>
      )}
    </aside>
  );
}

export function Sentinel({ index }: { index: string }) {
  const sentinel = usePoll(fetchSentinel, { key: 'sentinel', intervalMs: REFRESH_MS });
  const { data, error } = sentinel;
  const loading = sentinel.status === 'loading';

  return (
    <section className="section shell" id="sentinel" aria-labelledby="sentinel-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Sentinel</Kicker>
          <h2 className="h2" id="sentinel-title">
            <Words>Five gates between a bot and a reward.</Words>
          </h2>
        </div>
        <p className="lede">
          Sentinel is the security node that protects mining from bots, scripts, fake GPUs, sybil rigs and collusion.
          Every rig meets the same five gates, in the same order.
        </p>
      </div>

      <div className="sentinel section-body">
        <figure className="sentinel__figure" ref={revealRef} data-reveal="fade">
          <div className="sentinel__plate">
            <span className="sentinel__lab sentinel__lab--tl" aria-hidden="true">
              Fig. 2 · Five gates
            </span>
            <span className="sentinel__lab sentinel__lab--tr" aria-hidden="true">
              <span className="sentinel-sw sentinel-sw--passed" />
              Rig
              <span className="sentinel-sw sentinel-sw--blocked" />
              Bot
            </span>
            <SentinelTunnel />
          </div>
          <figcaption>
            <b>Rigs pass all five gates.</b> A bot is stopped at proof of GPU, a canary check or the cross-check,
            then pushed off the track into quarantine.
          </figcaption>
        </figure>
        <LivePanel data={data} loading={loading} error={error} onRetry={sentinel.retry} />
      </div>

      <ol className="gates" aria-label="The five gates">
        {SENTINEL_GATES.map((gate, position) => {
          const stats = gateStats(data, gate);
          const shown = loading || stats !== null;
          return (
            <li key={gate} className="gate" ref={revealRef} data-reveal="fade-up">
              <p className="gate__num">{String(position + 1).padStart(2, '0')}</p>
              <h3 className="gate__title">{GATES[gate].title}</h3>
              <p className="gate__body">{GATES[gate].body}</p>
              {shown && (
                <div className="gate__live" aria-busy={loading}>
                  <dl className="gate__stats">
                    <div>
                      <dt>
                        <span className="sentinel-sw sentinel-sw--passed" aria-hidden="true" />
                        Passed
                      </dt>
                      <dd>{reading(loading, stats?.passed)}</dd>
                    </div>
                    <div>
                      <dt>
                        <span className="sentinel-sw sentinel-sw--blocked" aria-hidden="true" />
                        Blocked
                      </dt>
                      <dd>{reading(loading, stats?.blocked)}</dd>
                    </div>
                  </dl>
                  {stats && (
                    <span className="gate__ratio" aria-hidden="true">
                      <i style={{ flexGrow: stats.passed }} />
                      <b style={{ flexGrow: stats.blocked }} />
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

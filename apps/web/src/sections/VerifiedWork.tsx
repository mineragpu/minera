import { fetchNetwork } from '../api/coordinator.ts';
import { usePoll } from '../api/usePoll.ts';
import { Kicker } from '../components/Kicker.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Words } from '../components/Words.tsx';
import { revealRef } from '../motion/revealObserver.ts';
import './verified-work.css';

const REFRESH_MS = 60_000;

const EARNS_NOTHING: readonly { what: string; why: string }[] = [
  { what: 'Uptime', why: 'Being online is not work.' },
  { what: 'Unverified answers', why: 'Nobody compared them.' },
  { what: 'Mismatched answers', why: 'Two rigs disagreed, so neither earns.' },
  { what: 'The checks themselves', why: 'Their answers can be worked out without a GPU.' },
];

/** A check in the form the network sends: arithmetic with one numeric answer. */
function ExampleCheck() {
  return (
    <dl className="kcheck">
      <div>
        <dt>Example check</dt>
        <dd>What is 7 times 48?</dd>
      </div>
      <div>
        <dt>Expected, never sent</dt>
        <dd>336</dd>
      </div>
    </dl>
  );
}

function CrossCheck() {
  return (
    <div className="xcheck" aria-hidden="true">
      <span className="xcheck__rig">Rig · operator A</span>
      <span className="xcheck__rig">Rig · operator B</span>
      <span className="xcheck__join" />
      <span className="xcheck__out">Same output</span>
    </div>
  );
}

/** The coordinator's own statement of the rules, so the page cannot drift from what it enforces. */
function RulesQuote() {
  const network = usePoll(fetchNetwork, { key: 'network', intervalMs: REFRESH_MS });
  if (network.status === 'error' && network.error) {
    return (
      <div className="rules-quote-error">
        <LoadError message={network.error.message} onRetry={network.retry} />
      </div>
    );
  }
  const rules = network.data?.rules ?? null;
  return (
    <figure className="rules-quote" aria-busy={rules === null}>
      <blockquote>
        {rules ? (
          <>
            <p>{rules.verification}</p>
            <p>{rules.units}</p>
          </>
        ) : (
          <Skeleton width="100%" height="5em" />
        )}
      </blockquote>
      <figcaption>The network service’s own rules, read live from its public API.</figcaption>
    </figure>
  );
}

export function VerifiedWork({ index }: { index: string }) {
  return (
    <section className="section shell" id="verified-work" aria-labelledby="verified-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Verified work</Kicker>
          <h2 className="h2" id="verified-title">
            <Words>Only checked answers earn.</Words>
          </h2>
        </div>
        <p className="lede">
          The network measures and checks the work itself. Nothing a rig reports about its own work is taken on trust.
        </p>
      </div>

      <div className="verdicts section-body">
        <article className="verdict verdict--earns" aria-labelledby="verdict-earns">
          <p className="verdict__tag">Earns</p>
          <h3 className="verdict__title" id="verdict-earns">
            Answers a second operator confirms
          </h3>
          <p className="verdict__body">
            Some prompts go to two rigs run by different operators. When both return the same output, the answer is
            verified, and each rig is credited with the work units of its answer.
          </p>
          <CrossCheck />
        </article>

        <article className="verdict verdict--gates" aria-labelledby="verdict-gates">
          <p className="verdict__tag">Gates</p>
          <h3 className="verdict__title" id="verdict-gates">
            Known-answer checks
          </h3>
          <p className="verdict__body">
            A rig takes open jobs only after it passes a check with a known answer, and again each time it reconnects.
            Checks repeat while it runs. A wrong answer, or a disagreement with another rig, counts as a failed check
            and stops new jobs until it passes again.
          </p>
          <ExampleCheck />
        </article>

        <article className="verdict verdict--none" aria-labelledby="verdict-none">
          <p className="verdict__tag">Earns nothing</p>
          <h3 className="verdict__title" id="verdict-none">
            Everything else
          </h3>
          <ul className="verdict__list">
            {EARNS_NOTHING.map(({ what, why }) => (
              <li key={what}>
                <b>{what}.</b> {why}
              </li>
            ))}
          </ul>
        </article>
      </div>

      <RulesQuote />
    </section>
  );
}

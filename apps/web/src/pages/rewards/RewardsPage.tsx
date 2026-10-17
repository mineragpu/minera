import { useState, type FormEvent } from 'react';
import { formatEther, getAddress, isAddress } from 'viem';
import type { Address } from '@minera/shared';
import { fetchClaims, fetchRewards } from '../../api/coordinator.ts';
import type { ClaimView, RewardsView } from '../../api/schemas.ts';
import { usePoll } from '../../api/usePoll.ts';
import { Button, ButtonLink } from '../../components/Button.tsx';
import { LoadError } from '../../components/LoadError.tsx';
import { Skeleton } from '../../components/Skeleton.tsx';
import { formatAmount, formatCount } from '../../lib/amount.ts';
import { addressUrl, txUrl } from '../../lib/explorer.ts';
import { formatDateTime, timeFromNow } from '../../lib/time.ts';
import { docPath } from '../docs/manifest.ts';
import { PATHS } from '../../router/routes.ts';
import { useDocumentTitle } from '../../router/useDocumentTitle.ts';
import { PageHead } from '../PageHead.tsx';
import '../../components/panel.css';
import './rewards-page.css';

const REFRESH_MS = 30_000;

const eth = (value: bigint) => `${formatAmount(value)} ETH`;
const short = (address: Address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function Totals({ rewards }: { rewards: RewardsView | null }) {
  const totals = rewards?.totals ?? null;
  const value = (text: string | null) => (text === null ? <Skeleton width="7ch" /> : text);
  return (
    <dl className="rewards-tiles">
      <div>
        <dt>Committed to rigs</dt>
        <dd>{value(totals ? eth(totals.committed) : null)}</dd>
      </div>
      <div>
        <dt>Claimed</dt>
        <dd>{value(totals ? eth(totals.claimed) : null)}</dd>
      </div>
      <div>
        <dt>Waiting to be claimed</dt>
        <dd>{value(totals ? eth(totals.unclaimed) : null)}</dd>
      </div>
      <div>
        <dt>Still in the pool</dt>
        <dd>{value(totals ? eth(totals.inPool) : null)}</dd>
      </div>
      <div>
        <dt>Operators paid</dt>
        <dd>{value(totals ? formatCount(totals.accounts) : null)}</dd>
      </div>
      <div>
        <dt>Settlements</dt>
        <dd>{value(totals ? formatCount(totals.settlements) : null)}</dd>
      </div>
    </dl>
  );
}

function NextSettlement({ rewards }: { rewards: RewardsView }) {
  const { pending, epochEndsAt } = rewards;
  return (
    <section className="panel rewards-next" aria-labelledby="rewards-next-title">
      <h2 className="rewards-h2" id="rewards-next-title">
        Next
      </h2>
      {pending ? (
        <p>
          Settlement {pending.index} becomes claimable {timeFromNow(pending.claimableAt)}, at{' '}
          {formatDateTime(pending.claimableAt)}. The next one is built after that, at the end of an hour with
          verified work.
        </p>
      ) : (
        <p>
          The next settlement is built when this hour ends, {timeFromNow(epochEndsAt)}, if rigs did verified work in
          it.
        </p>
      )}
    </section>
  );
}

function WalletCheck() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ClaimView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    setResult(null);
    if (!isAddress(text, { strict: false })) {
      setProblem('Enter a wallet address: 0x followed by 40 hexadecimal characters.');
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      setResult(await fetchClaims(getAddress(text), AbortSignal.timeout(15_000)));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The rewards for this wallet could not be read.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel rewards-check" aria-labelledby="rewards-check-title">
      <h2 className="rewards-h2" id="rewards-check-title">
        Check a wallet
      </h2>
      <form className="rewards-check__form" onSubmit={check}>
        <label className="sr-only" htmlFor="rewards-wallet">
          Operator wallet address
        </label>
        <input
          id="rewards-wallet"
          className="rewards-check__input"
          placeholder="0x… operator wallet"
          autoComplete="off"
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <Button variant="ghost" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Reading…' : 'Check'}
        </Button>
      </form>
      {problem && <p className="rewards-check__problem">{problem}</p>}
      {result && (
        <dl className="rewards-check__result">
          <div>
            <dt>Earned</dt>
            <dd>{eth(result.cumulative)}</dd>
          </div>
          <div>
            <dt>Claimed</dt>
            <dd>{eth(result.claimed)}</dd>
          </div>
          <div>
            <dt>Claimable now</dt>
            <dd>{eth(result.claimable)}</dd>
          </div>
          {result.pending && (
            <div>
              <dt>In the next settlement</dt>
              <dd>
                {eth(result.pending.cumulative > result.cumulative ? result.pending.cumulative - result.cumulative : 0n)}
              </dd>
            </div>
          )}
        </dl>
      )}
      {result && result.claimable > 0n && (
        <ButtonLink variant="primary" href={PATHS.claim}>
          Claim it
        </ButtonLink>
      )}
    </section>
  );
}

function Earners({ rewards }: { rewards: RewardsView }) {
  if (rewards.earners.length === 0) {
    return <p className="rewards-empty">No operator has earned yet. The first settlement pays the first rigs with verified work.</p>;
  }
  return (
    <div className="rewards-table" role="table" aria-label="Operators by reward earned">
      <div className="rewards-table__row rewards-table__head" role="row">
        <span role="columnheader">Operator</span>
        <span role="columnheader">Earned</span>
        <span role="columnheader">Claimed</span>
        <span role="columnheader">Claimable now</span>
      </div>
      {rewards.earners.map((earner) => (
        <div className="rewards-table__row" role="row" key={earner.account}>
          <span role="cell" data-label="Operator">
            <a className="text-link" href={addressUrl(earner.account)} target="_blank" rel="noreferrer" title={earner.account}>
              {short(earner.account)}
            </a>
          </span>
          <span role="cell" data-label="Earned">
            {eth(earner.earned)}
          </span>
          <span role="cell" data-label="Claimed">
            {eth(earner.claimed)}
          </span>
          <span role="cell" data-label="Claimable now">
            {eth(earner.claimable)}
          </span>
        </div>
      ))}
    </div>
  );
}

function settlementStatus(settlement: RewardsView['settlements'][number], now: number): string {
  if (settlement.vetoed) return 'Vetoed';
  if (settlement.claimableAt && settlement.claimableAt.getTime() > now) return `Claimable ${timeFromNow(settlement.claimableAt, now)}`;
  return 'Claimable';
}

function Settlements({ rewards }: { rewards: RewardsView }) {
  const now = Date.now();
  if (rewards.settlements.length === 0) {
    return <p className="rewards-empty">No settlement has been published yet.</p>;
  }
  return (
    <div className="rewards-table rewards-table--five" role="table" aria-label="Settlements, newest first">
      <div className="rewards-table__row rewards-table__head" role="row">
        <span role="columnheader">Settlement</span>
        <span role="columnheader">Added</span>
        <span role="columnheader">Published</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Transaction</span>
      </div>
      {rewards.settlements.map((settlement) => (
        <div className="rewards-table__row" role="row" key={settlement.index}>
          <span role="cell" data-label="Settlement">
            #{settlement.index}
          </span>
          <span role="cell" data-label="Added">
            {eth(settlement.added)}
          </span>
          <span role="cell" data-label="Published">
            {settlement.publishedAt ? formatDateTime(settlement.publishedAt) : 'Not yet'}
          </span>
          <span role="cell" data-label="Status">
            {settlementStatus(settlement, now)}
          </span>
          <span role="cell" data-label="Transaction">
            {settlement.txHash ? (
              <a className="text-link" href={txUrl(settlement.txHash)} target="_blank" rel="noreferrer">
                {settlement.txHash.slice(0, 10)}…
              </a>
            ) : (
              'None'
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function Rules({ rewards }: { rewards: RewardsView }) {
  const { rules } = rewards;
  const percent = rules.releaseBpsPerDay === null ? null : Number(rules.releaseBpsPerDay) / 100;
  const delayHours = rules.challengeDelaySeconds === null ? null : Number(rules.challengeDelaySeconds) / 3600;
  return (
    <section className="panel rewards-rules" aria-labelledby="rewards-rules-title">
      <h2 className="rewards-h2" id="rewards-rules-title">
        How rewards are paid
      </h2>
      <ul>
        <li>Only answers a second, unrelated rig confirmed earn anything, and only on visitors&apos; prompts.</li>
        <li>Each paid unit earns at most {formatEther(rules.maxWeiPerUnit)} ETH per settlement; the rest stays in the pool.</li>
        {rules.perOriginUnits > 0 && (
          <li>Prompts from one network can earn rigs at most {formatCount(rules.perOriginUnits)} paid units an hour.</li>
        )}
        {rules.perPairUnits > 0 && (
          <li>Two rigs that verify each other can earn at most {formatCount(rules.perPairUnits)} paid units an hour together.</li>
        )}
        <li>A new rig is paid {rules.probationPayBps / 100}% until it passes its checks.</li>
        {percent !== null && <li>The pool releases at most {percent}% of what it holds a day.</li>}
        {delayHours !== null && <li>Each settlement can be claimed {delayHours} hours after it is published.</li>}
      </ul>
      <a className="text-link" href={docPath('verification-and-rewards')}>
        The full rules
      </a>
    </section>
  );
}

export function RewardsPage() {
  useDocumentTitle('Rewards');
  const rewards = usePoll(fetchRewards, { key: 'rewards', intervalMs: REFRESH_MS });
  const data = rewards.data ?? null;

  return (
    <>
      <PageHead kicker="Rewards" title="Rewards for verified work.">
        Rigs are paid in ETH from the Burn Pool for answers the network verified. Work is counted hour by hour and
        settled as the pool allows. Every figure on this page is read from the chain and the network, and refreshes
        on its own.
      </PageHead>
      <div className="page-body rewards-page">
        {rewards.status === 'error' && rewards.error && !data ? (
          <LoadError message={rewards.error.message} onRetry={rewards.retry} />
        ) : (
          <>
            <Totals rewards={data} />
            {data && <NextSettlement rewards={data} />}
            <WalletCheck />
            {data && (
              <>
                <section aria-labelledby="rewards-earners-title" className="rewards-section">
                  <h2 className="rewards-h2" id="rewards-earners-title">
                    Who has earned
                  </h2>
                  <Earners rewards={data} />
                </section>
                <section aria-labelledby="rewards-settlements-title" className="rewards-section">
                  <h2 className="rewards-h2" id="rewards-settlements-title">
                    Settlements
                  </h2>
                  <Settlements rewards={data} />
                </section>
                <Rules rewards={data} />
              </>
            )}
            <div className="rewards-cta">
              <ButtonLink variant="primary" href={PATHS.deploy}>
                Deploy your GPU
              </ButtonLink>
              <ButtonLink variant="ghost" href={PATHS.claim}>
                Claim your rewards
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </>
  );
}

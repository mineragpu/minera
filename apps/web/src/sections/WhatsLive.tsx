import type { ReactNode } from 'react';
import { fetchNetwork } from '../api/coordinator.ts';
import { usePoll } from '../api/usePoll.ts';
import { CountUp } from '../components/CountUp.tsx';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { LiveDot } from '../components/LiveDot.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { SheenSpot } from '../components/SheenSpot.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Words } from '../components/Words.tsx';
import { CheckIcon, ExternalIcon } from '../components/icons.tsx';
import { DEPLOYMENT } from '../config/contracts.ts';
import { ACTIVE_CHAIN, ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { formatAmount, formatCount, toFloat } from '../lib/amount.ts';
import { addressUrl } from '../lib/explorer.ts';
import { timeFromNow } from '../lib/time.ts';
import { useMergedRef } from '../lib/useMergedRef.ts';
import { verifiedSourceUrl } from '../lib/verifiedSource.ts';
import { revealRef } from '../motion/revealObserver.ts';
import { useReducedMotion } from '../motion/useReducedMotion.ts';
import { useReveal } from '../motion/useReveal.ts';
import { useSheenFollow } from '../motion/useSheenFollow.ts';
import '../components/panel.css';
import './whats-live.css';

const REFRESH_MS = 30_000;

/** An address of all zeros marks a contract this network does not have yet. */
const UNSET = /^0x0{40}$/;
function deployedCount(deployment: typeof DEPLOYMENT): number {
  if (!deployment) return 0;
  return (['burnPool', 'rigRegistry', 'pairZap'] as const).filter((key) => !UNSET.test(deployment[key])).length;
}
const DEPLOYED_COUNT = deployedCount(DEPLOYMENT);

interface ContractInfo {
  key: 'burnPool' | 'rigRegistry' | 'pairZap';
  name: string;
  role: string;
  color: string;
}

const CONTRACTS: readonly ContractInfo[] = [
  {
    key: 'burnPool',
    name: 'Burn Pool',
    role: 'Holds the ETH that pays rewards. It has no withdraw function.',
    color: 'var(--teal)',
  },
  {
    key: 'rigRegistry',
    name: 'Rig registry',
    role: 'Records each rig, the wallet that operates it and the asset it pairs with.',
    color: 'var(--violet)',
  },
  {
    key: 'pairZap',
    name: 'Pair zap',
    role: 'Swaps a claim from ETH into a listed stock token, on a route fixed at deployment.',
    color: 'var(--gold)',
  },
];

function Contracts() {
  const deployment = DEPLOYMENT;
  const sheen = useSheenFollow<HTMLDivElement>();
  const panelRef = useMergedRef(sheen, revealRef);
  if (!deployment) {
    return (
      <div className="panel live-contracts" ref={panelRef} data-reveal="fade-up">
        <SheenSpot />
        <p className="live-contracts__none">The contracts are not deployed on {ACTIVE_CHAIN.name} yet.</p>
      </div>
    );
  }
  return (
    <div className="panel live-contracts" ref={panelRef} data-reveal="fade-up">
      <SheenSpot />
      <div className="panel__head">
        <h3 className="panel__title">Contracts</h3>
        <span className="live-contracts__chain">
          {ACTIVE_NETWORK_LABEL} · chain ID {ACTIVE_CHAIN.id}
        </span>
      </div>
      <ul className="contracts">
        {CONTRACTS.filter(({ key }) => !UNSET.test(deployment[key])).map(({ key, name, role, color }) => {
          const address = deployment[key];
          return (
            <li key={key} className="contract" ref={revealRef} data-reveal="contract">
              <CubeGlyph className="contract__glyph" color={color} />
              <div className="contract__what">
                <h4 className="contract__name">{name}</h4>
                <p className="contract__role">{role}</p>
              </div>
              <p className="contract__address">{address}</p>
              <p className="contract__links">
                <a className="contract__link" href={addressUrl(address)} target="_blank" rel="noreferrer">
                  Explorer<span className="sr-only">: {name}</span>
                  <ExternalIcon />
                </a>
                <a
                  className="contract__link contract__link--verified"
                  href={verifiedSourceUrl(address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <CheckIcon />
                  Source verified<span className="sr-only">: {name}</span>
                  <ExternalIcon />
                </a>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="live-contracts__note">
        Source verified means the published source compiles to exactly the code deployed on the chain.
      </p>
    </div>
  );
}

function Figure({ label, order, children }: { label: string; order: number; children: ReactNode }) {
  return (
    <div style={{ '--fig': order }}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function LiveReadout() {
  const network = usePoll(fetchNetwork, { key: 'network', intervalMs: REFRESH_MS });
  const { data } = network;
  const [readoutRef, revealed] = useReveal<HTMLDivElement>();
  const reduced = useReducedMotion();
  const count = revealed && !reduced;
  const skeleton = <Skeleton width="7ch" />;

  return (
    <div className="live-readout" ref={readoutRef} data-reveal="readout" aria-busy={data === null}>
      <h3 className="live-readout__title">
        <LiveDot />
        The network now
      </h3>
      {network.status === 'error' && network.error ? (
        <div className="live-readout__error">
          <LoadError message={network.error.message} onRetry={network.retry} />
        </div>
      ) : (
        <dl className="live-figures">
          <Figure label="Rigs online" order={0}>
            {data ? (
              <>
                <CountUp value={data.rigs.online} text={formatCount(data.rigs.online)} run={count} />
                <span className="live-figures__unit"> of {formatCount(data.rigs.total)} deployed</span>
              </>
            ) : (
              skeleton
            )}
          </Figure>
          <Figure label="Verified work, 24 h" order={1}>
            {data ? (
              <>
                <CountUp
                  value={Number(data.last24h.verifiedUnits)}
                  text={formatCount(data.last24h.verifiedUnits)}
                  run={count}
                />
                <span className="live-figures__unit"> units</span>
              </>
            ) : (
              skeleton
            )}
          </Figure>
          <Figure label="Burned into the pool" order={2}>
            {data ? (
              data.pool ? (
                <>
                  <CountUp value={toFloat(data.pool.totalBurned)} text={formatAmount(data.pool.totalBurned)} run={count} />
                  <span className="live-figures__unit"> ETH</span>
                </>
              ) : (
                <span className="live-figures__unit">Not read yet</span>
              )
            ) : (
              skeleton
            )}
          </Figure>
          <Figure label="This epoch ends" order={3}>
            {data ? timeFromNow(data.epoch.endsAt) : skeleton}
          </Figure>
        </dl>
      )}
      <p className="live-readout__foot">Read from the network service every 30 seconds.</p>
    </div>
  );
}

export function WhatsLive({ index }: { index: string }) {
  const network = ACTIVE_NETWORK_LABEL.toLowerCase();
  return (
    <section className="section shell" id="whats-live" aria-labelledby="live-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>What’s live</Kicker>
          <h2 className="h2" id="live-title">
            <Words>{DEPLOYMENT ? `Running on ${network} today.` : `Not on ${network} yet.`}</Words>
          </h2>
        </div>
        <p className="lede">
          {DEPLOYED_COUNT === 3 ? 'Three' : 'Two'} contracts, and the network service that measures the work. Every figure
          here is read from them.
        </p>
      </div>
      <div className="live-grid section-body">
        <LiveReadout />
        <Contracts />
      </div>
    </section>
  );
}

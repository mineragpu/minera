import type { ReactNode } from 'react';
import { fetchNetwork } from '../api/coordinator.ts';
import { usePoll } from '../api/usePoll.ts';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { LiveDot } from '../components/LiveDot.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Words } from '../components/Words.tsx';
import { CheckIcon, ExternalIcon } from '../components/icons.tsx';
import { DEPLOYMENT } from '../config/contracts.ts';
import { ACTIVE_CHAIN, ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { formatAmount, formatCount } from '../lib/amount.ts';
import { addressUrl } from '../lib/explorer.ts';
import { timeFromNow } from '../lib/time.ts';
import { verifiedSourceUrl } from '../lib/verifiedSource.ts';
import { revealRef } from '../motion/revealObserver.ts';
import '../components/panel.css';
import './whats-live.css';

const REFRESH_MS = 30_000;

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
  if (!deployment) {
    return (
      <div className="panel live-contracts">
        <p className="live-contracts__none">The contracts are not deployed on {ACTIVE_CHAIN.name} yet.</p>
      </div>
    );
  }
  return (
    <div className="panel live-contracts">
      <div className="panel__head">
        <h3 className="panel__title">Contracts</h3>
        <span className="live-contracts__chain">
          {ACTIVE_NETWORK_LABEL} · chain ID {ACTIVE_CHAIN.id}
        </span>
      </div>
      <ul className="contracts">
        {CONTRACTS.map(({ key, name, role, color }) => {
          const address = deployment[key];
          return (
            <li key={key} className="contract">
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

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function LiveReadout() {
  const network = usePoll(fetchNetwork, { key: 'network', intervalMs: REFRESH_MS });
  const { data } = network;
  const skeleton = <Skeleton width="7ch" />;

  return (
    <div className="live-readout" aria-busy={data === null}>
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
          <Figure label="Rigs online">
            {data ? (
              <>
                {formatCount(data.rigs.online)}
                <span className="live-figures__unit"> of {formatCount(data.rigs.total)} deployed</span>
              </>
            ) : (
              skeleton
            )}
          </Figure>
          <Figure label="Verified work, 24 h">
            {data ? (
              <>
                {formatCount(data.last24h.verifiedUnits)}
                <span className="live-figures__unit"> units</span>
              </>
            ) : (
              skeleton
            )}
          </Figure>
          <Figure label="Burned into the pool">
            {data ? (
              data.pool ? (
                <>
                  {formatAmount(data.pool.totalBurned)}
                  <span className="live-figures__unit"> ETH</span>
                </>
              ) : (
                <span className="live-figures__unit">Not read yet</span>
              )
            ) : (
              skeleton
            )}
          </Figure>
          <Figure label="This epoch ends">{data ? timeFromNow(data.epoch.endsAt) : skeleton}</Figure>
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
          Three contracts, and the network service that measures the work. Every figure here is read from them.
        </p>
      </div>
      <div className="live-grid section-body">
        <LiveReadout />
        <Contracts />
      </div>
    </section>
  );
}

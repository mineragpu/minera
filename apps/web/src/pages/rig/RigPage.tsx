import type { Address } from '@minera/shared';
import { fetchRig } from '../../api/coordinator.ts';
import type { RigDetail } from '../../api/schemas.ts';
import { usePoll } from '../../api/usePoll.ts';
import { ButtonLink } from '../../components/Button.tsx';
import { LoadError } from '../../components/LoadError.tsx';
import { RigState } from '../../components/RigState.tsx';
import { Skeleton } from '../../components/Skeleton.tsx';
import { Sparkline } from '../../components/Sparkline.tsx';
import { formatCount } from '../../lib/amount.ts';
import { addressUrl } from '../../lib/explorer.ts';
import { pairLabel } from '../../lib/pairLabel.ts';
import { rigHue } from '../../lib/rigHue.ts';
import { formatDateTime, timeFromNow } from '../../lib/time.ts';
import { PATHS } from '../../router/routes.ts';
import { useDocumentTitle } from '../../router/useDocumentTitle.ts';
import { PageHead } from '../PageHead.tsx';
import '../../components/panel.css';
import '../../components/rig-card.css';
import './rig-page.css';

const REFRESH_MS = 30_000;
const NODE_KEY = /^0x[0-9a-fA-F]{40}$/;

function hourLabel(hour: Date): string {
  return hour.toLocaleTimeString('en-US', { hour: 'numeric' });
}

function AddressValue({ address }: { address: Address }) {
  return (
    <a className="text-link rig-address" href={addressUrl(address)} target="_blank" rel="noreferrer">
      {address}
    </a>
  );
}

function HourlyWork({ rig }: { rig: RigDetail }) {
  const values = rig.hourly.map((entry) => Number(entry.verifiedUnits));
  const total = rig.hourly.reduce((sum, entry) => sum + entry.verifiedUnits, 0n);
  const first = rig.hourly[0];
  const labels = rig.hourly.map((entry) => `${hourLabel(entry.hour)}: ${formatCount(entry.verifiedUnits)} units`);
  return (
    <figure className="panel rig-chart" style={{ '--hue': rigHue(rig.nodeKey) }}>
      <figcaption className="rig-chart__head">
        <span className="rig-chart__label">Verified work per hour, last 24 hours</span>
        <span className="rig-chart__total">{formatCount(total)} units</span>
      </figcaption>
      <Sparkline
        className="spark--wide"
        values={values}
        width={720}
        height={120}
        pointLabels={labels}
        label={`Verified work per hour over the last 24 hours, ${formatCount(total)} units in total.`}
      />
      <div className="rig-chart__axis" aria-hidden="true">
        <span>{first ? hourLabel(first.hour) : ''}</span>
        <span>This hour</span>
      </div>
      <table className="sr-only">
        <caption>Verified work units per hour</caption>
        <thead>
          <tr>
            <th scope="col">Hour starting</th>
            <th scope="col">Units</th>
          </tr>
        </thead>
        <tbody>
          {rig.hourly.map((entry) => (
            <tr key={entry.hour.toISOString()}>
              <td>{formatDateTime(entry.hour)}</td>
              <td>{formatCount(entry.verifiedUnits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function RigView({ rig }: { rig: RigDetail }) {
  const pair = pairLabel(rig.pair);
  return (
    <>
      <PageHead
        kicker="Rig"
        title={rig.name}
        aside={
          <span className={`badge badge--${pair.kind === 'native' ? 'eth' : 'stock'}`}>
            <span className="sr-only">Paired with </span>
            {pair.text}
          </span>
        }
      >
        Deployed {timeFromNow(rig.deployedAt)}, paired with {pair.text}.
        {rig.retired ? ' Its operator has retired it, so it takes no more work.' : ''}
      </PageHead>
      <div className="page-body rig-page">
        <dl className="rig-tiles">
          <div>
            <dt>Status</dt>
            <dd>
              <RigState online={rig.online} lastSeenAt={rig.lastSeenAt} />
            </dd>
          </div>
          <div>
            <dt>Verified this epoch</dt>
            <dd>{formatCount(rig.verifiedUnits.epoch)} units</dd>
          </div>
          <div>
            <dt>Verified in total</dt>
            <dd>{formatCount(rig.verifiedUnits.lifetime)} units</dd>
          </div>
          <div>
            <dt>Failed checks</dt>
            <dd>
              {formatCount(rig.checks.failed)}
              <span className="rig-tiles__sub"> of {formatCount(rig.checks.passed + rig.checks.failed)}</span>
            </dd>
          </div>
        </dl>

        <HourlyWork rig={rig} />

        <dl className="rig-details">
          <div>
            <dt>Node address</dt>
            <dd>
              <AddressValue address={rig.nodeKey} />
            </dd>
          </div>
          <div>
            <dt>Operator</dt>
            <dd>
              <AddressValue address={rig.operator} />
            </dd>
          </div>
          <div>
            <dt>Pair</dt>
            <dd>
              {pair.text}
              {pair.kind === 'stock' && (
                <>
                  {' · '}
                  <AddressValue address={rig.pair} />
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Deployed</dt>
            <dd>
              {formatDateTime(rig.deployedAt)}, block {formatCount(rig.deployedBlock)}
            </dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{rig.lastSeenAt ? formatDateTime(rig.lastSeenAt) : 'Not connected yet'}</dd>
          </div>
          <div>
            <dt>Models</dt>
            <dd>{rig.models.length > 0 ? rig.models.join(', ') : 'None reported yet'}</dd>
          </div>
          {rig.retiredAt && (
            <div>
              <dt>Retired</dt>
              <dd>{formatDateTime(rig.retiredAt)}</dd>
            </div>
          )}
        </dl>
      </div>
    </>
  );
}

function RigLoader({ nodeKey }: { nodeKey: Address }) {
  const rig = usePoll((signal) => fetchRig(nodeKey, signal), { key: `rig:${nodeKey}`, intervalMs: REFRESH_MS });
  useDocumentTitle(rig.data ? rig.data.name : 'Rig');

  if (rig.data) return <RigView rig={rig.data} />;
  if (rig.status === 'error' && rig.error) {
    const missing = rig.error.status === 404;
    return (
      <>
        <PageHead kicker="Rig" title={missing ? 'No rig here yet.' : 'This rig could not be loaded.'}>
          {missing
            ? 'The network has no deployed rig with this node address. A rig deployed in the last minute may not be indexed yet; this page keeps checking.'
            : null}
        </PageHead>
        <div className="page-body">
          {missing ? (
            <ButtonLink variant="ghost" href={PATHS.deploy}>
              Deploy a rig
            </ButtonLink>
          ) : (
            <LoadError message={rig.error.message} onRetry={rig.retry} />
          )}
        </div>
      </>
    );
  }
  return (
    <div className="page-loading" aria-busy="true">
      <Skeleton width="min(50%, 420px)" height="3.2em" />
      <Skeleton width="min(70%, 560px)" height="1.2em" />
    </div>
  );
}

export function RigPage({ nodeKey }: { nodeKey: string }) {
  const valid = NODE_KEY.test(nodeKey);
  return (
    <div className="shell">
      {valid ? <RigLoader nodeKey={nodeKey as Address} /> : <InvalidNodeKey />}
    </div>
  );
}

function InvalidNodeKey() {
  useDocumentTitle('Rig');
  return (
    <PageHead kicker="Rig" title="That is not a node address.">
      A node address is 0x followed by 40 hexadecimal characters.
    </PageHead>
  );
}

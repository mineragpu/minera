import { ButtonLink } from '../components/Button.tsx';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';
import { DEPLOYMENT } from '../config/contracts.ts';
import { ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { PATHS } from '../router/routes.ts';
import '../components/panel.css';
import './deploy.css';

const STEPS: readonly { title: string; detail: string }[] = [
  { title: 'Connect your wallet', detail: 'It operates the rig and receives its rewards.' },
  { title: 'Run the node client', detail: 'One command creates the node key and prints its deploy code.' },
  { title: 'Paste the deploy code', detail: 'The page checks it against your wallet before anything is sent.' },
  { title: 'Name it and pair it', detail: 'Up to 32 bytes, paired with ETH or a listed stock token.' },
  { title: 'Send one transaction', detail: 'The registry records the rig. You pay only the network fee.' },
];

export function DeployPanel({ index }: { index: string }) {
  return (
    <section className="section shell" id="deploy" aria-labelledby="deploy-title">
      <div className="deploy">
        <div className="deploy__copy">
          <Kicker index={index}>Deploy</Kicker>
          <h2 className="h2" id="deploy-title">
            Name&nbsp;it. Pair&nbsp;it. Deploy&nbsp;it.
          </h2>
          <p className="lede">
            The node client creates the rig’s key and signs a deploy code for your wallet. You choose the name and
            the pair, then send one transaction.
          </p>
          <ul className="points">
            <li>
              <CubeGlyph color="var(--teal)" />
              <div>
                <b>Signed by the node</b>
                <span className="pt">The deploy code proves the node agreed to your wallet, on this network only.</span>
              </div>
            </li>
            <li>
              <CubeGlyph color="var(--violet)" />
              <div>
                <b>Paid in your pair</b>
                <span className="pt">Rewards arrive in ETH or in the stock token you choose.</span>
              </div>
            </li>
            <li>
              <CubeGlyph color="var(--gold)" />
              <div>
                <b>On the board in a minute</b>
                <span className="pt">Once the network indexes the deploy, the rig gets its card and its own page.</span>
              </div>
            </li>
          </ul>
        </div>

        <div className="panel deploy-steps">
          <div className="panel__head">
            <h3 className="panel__title">New rig</h3>
            {DEPLOYMENT ? (
              <span className="status status--open">Open on {ACTIVE_NETWORK_LABEL.toLowerCase()}</span>
            ) : (
              <span className="status">Not open yet</span>
            )}
          </div>
          <ol className="dsteps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="dsteps__n" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <b>{step.title}</b>
                  <span>{step.detail}</span>
                </div>
              </li>
            ))}
          </ol>
          <ButtonLink variant="primary" block href={PATHS.deploy}>
            Start deploying
            <ArrowRightIcon />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { Ticker } from '../components/Ticker.tsx';
import { DeployForm } from './DeployForm.tsx';
import './deploy.css';

export function DeployPanel() {
  return (
    <section className="section shell" id="deploy" aria-labelledby="deploy-title">
      <div className="deploy">
        <div className="deploy__copy">
          <Kicker index="01">Deploy</Kicker>
          <h2 className="h2" id="deploy-title">
            Name&nbsp;it. Pair&nbsp;it. Deploy&nbsp;it.
          </h2>
          <p className="lede">
            The node client reads your card, so the hardware line fills itself in. You choose the name, the
            pair and the bond.
          </p>
          <ul className="points">
            <li>
              <CubeGlyph color="var(--teal)" />
              <div>
                <b>Detected, not typed</b>
                <span className="pt">VRAM and FP16 throughput come straight from the node client.</span>
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
                <b>
                  Bonded in <Ticker />
                </b>
                <span className="pt">The bond stays with the rig while it mines.</span>
              </div>
            </li>
          </ul>
        </div>

        <DeployForm />
      </div>
    </section>
  );
}

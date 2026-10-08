import { ButtonLink } from '../components/Button.tsx';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { TokenAddress } from '../components/TokenAddress.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';
import { BlockCluster } from '../components/cluster/BlockCluster.tsx';
import { PATHS } from '../router/routes.ts';
import { NetworkFigures } from './NetworkFigures.tsx';
import './hero.css';

/** Load-sequence delay for one element of the hero stagger. */
function rise(seconds: number) {
  return { '--rd': `${seconds}s` };
}

export function Hero() {
  return (
    <section className="hero shell" aria-labelledby="hero-title">
      <div className="hero__copy">
        <h1 className="hero__title" id="hero-title" tabIndex={-1}>
          <span className="ln rise" style={rise(0.12)}>
            Deploy a GPU
          </span>
          <span className="ln rise" style={rise(0.2)}>
            like you’d
          </span>
          <span className="ln rise" style={rise(0.28)}>
            launch <span className="accent">a token.</span>
          </span>
        </h1>
        <p className="hero__sub rise" style={rise(0.38)}>
          Plug in your card, choose whether its rewards pair with ETH or a tokenized stock, and mine from
          a pool that only fills.
        </p>
        <div className="hero__ctas rise" style={rise(0.48)}>
          <ButtonLink variant="primary" href={PATHS.deploy}>
            Deploy your GPU
            <ArrowRightIcon />
          </ButtonLink>
          <ButtonLink variant="ghost" href="#burn-pool">
            See the Burn Pool
          </ButtonLink>
        </div>
        <div className="hero__token rise" style={rise(0.53)}>
          <TokenAddress />
        </div>
        <NetworkFigures style={rise(0.58)} />
      </div>

      <figure className="hero__visual">
        <div className="specimen">
          <div className="specimen__glow" aria-hidden="true" />
          <div className="specimen__frame" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="lab lab--tl" aria-hidden="true">
            Fig. 1 · Network view
          </span>
          <span className="lab lab--tr" aria-hidden="true">
            Testnet
          </span>
          <BlockCluster />
          <span className="lab lab--bl" aria-hidden="true">
            <CubeGlyph color="var(--teal)" />1 block = 1 unit of verified work
          </span>
        </div>
        <figcaption className="rise" style={rise(0.7)}>
          <b>Every block is a unit of verified GPU work.</b> As rigs join, the blocks lock into one lattice.
          That lattice is the network.
        </figcaption>
      </figure>
    </section>
  );
}

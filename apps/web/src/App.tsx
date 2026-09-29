import { LatticeBackground } from './components/LatticeBackground.tsx';
import { SvgDefs } from './components/SvgDefs.tsx';
import { Hero } from './sections/Hero.tsx';
import { BurnPool } from './sections/BurnPool.tsx';
import { DeployPanel } from './sections/DeployPanel.tsx';
import { HowItWorks } from './sections/HowItWorks.tsx';
import { Launchpad } from './sections/Launchpad.tsx';
import { Nav } from './sections/Nav.tsx';

export function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <SvgDefs />
      <div className="page">
        <LatticeBackground />
        <Nav />
        <main id="main">
          <Hero />
          <DeployPanel />
          <BurnPool />
          <Launchpad />
          <HowItWorks />
        </main>
      </div>
    </>
  );
}

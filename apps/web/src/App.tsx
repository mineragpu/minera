import { LatticeBackground } from './components/LatticeBackground.tsx';
import { SvgDefs } from './components/SvgDefs.tsx';
import { BurnPool } from './sections/BurnPool.tsx';
import { Campaigns } from './sections/Campaigns.tsx';
import { DeployPanel } from './sections/DeployPanel.tsx';
import { Footer } from './sections/Footer.tsx';
import { Hero } from './sections/Hero.tsx';
import { HowItWorks } from './sections/HowItWorks.tsx';
import { Launchpad } from './sections/Launchpad.tsx';
import { Nav } from './sections/Nav.tsx';
import { ConnectDialogProvider } from './wallet/ConnectDialogProvider.tsx';
import { WalletProvider } from './wallet/WalletProvider.tsx';

export function App() {
  return (
    <WalletProvider>
      <ConnectDialogProvider>
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
            <Campaigns />
          </main>
          <Footer />
        </div>
      </ConnectDialogProvider>
    </WalletProvider>
  );
}

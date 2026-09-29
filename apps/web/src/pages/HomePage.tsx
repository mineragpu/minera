import { useDocumentTitle } from '../router/useDocumentTitle.ts';
import { BurnPool } from '../sections/BurnPool.tsx';
import { Campaigns } from '../sections/Campaigns.tsx';
import { DeployPanel } from '../sections/DeployPanel.tsx';
import { Hero } from '../sections/Hero.tsx';
import { HowItWorks } from '../sections/HowItWorks.tsx';
import { Launchpad } from '../sections/Launchpad.tsx';
import { PlaygroundSection } from '../sections/PlaygroundSection.tsx';

export function HomePage() {
  useDocumentTitle(null);
  return (
    <>
      <Hero />
      <DeployPanel />
      <BurnPool />
      <Launchpad />
      <PlaygroundSection />
      <HowItWorks />
      <Campaigns />
    </>
  );
}

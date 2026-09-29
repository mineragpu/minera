import type { ComponentType } from 'react';
import { useDocumentTitle } from '../router/useDocumentTitle.ts';
import { BurnPool } from '../sections/BurnPool.tsx';
import { Campaigns } from '../sections/Campaigns.tsx';
import { DeployPanel } from '../sections/DeployPanel.tsx';
import { Hero } from '../sections/Hero.tsx';
import { HowItWorks } from '../sections/HowItWorks.tsx';
import { Launchpad } from '../sections/Launchpad.tsx';
import { PairWith } from '../sections/PairWith.tsx';
import { PlaygroundSection } from '../sections/PlaygroundSection.tsx';
import { Story } from '../sections/Story.tsx';
import { WhatsLive } from '../sections/WhatsLive.tsx';

/** The numbered sections under the hero, in reading order; each kicker shows its position. */
const SECTIONS: readonly ComponentType<{ index: string }>[] = [
  WhatsLive,
  Story,
  HowItWorks,
  DeployPanel,
  PairWith,
  BurnPool,
  Launchpad,
  PlaygroundSection,
  Campaigns,
];

export function HomePage() {
  useDocumentTitle(null);
  return (
    <>
      <Hero />
      {SECTIONS.map((Section, position) => (
        <Section key={position} index={String(position + 1).padStart(2, '0')} />
      ))}
    </>
  );
}

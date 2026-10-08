import { ButtonLink } from '../components/Button.tsx';
import { SocialLinks } from '../components/SocialLinks.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
import { pageProgressRef } from '../motion/pageProgress.ts';
import { useSectionSpy } from '../motion/useSectionSpy.ts';
import { PATHS, type Route } from '../router/routes.ts';
import { useWallet } from '../wallet/useWallet.ts';
import { WalletButton } from '../wallet/WalletButton.tsx';
import { NAV_LINKS } from './navLinks.ts';
import './nav.css';

export function Nav({ route }: { route: Route }) {
  const onHome = route.name === 'home';
  const section = useSectionSpy(onHome);
  const { status } = useWallet();
  const connected = status === 'connected';

  return (
    <header className="topbar" id="top">
      <div className="topbar__inner">
        <Wordmark />
        <nav className="topnav" aria-label="Primary">
          <ul>
            {NAV_LINKS.filter((link) => !link.needsWallet || connected || link.route === route.name).map((link) => {
              let current: 'page' | 'location' | undefined;
              if (link.route === route.name) current = 'page';
              else if (onHome && link.section !== undefined && link.section === section) current = 'location';
              return (
                <li key={link.label}>
                  <a href={link.href} aria-current={current}>
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <SocialLinks className="topbar__social" />
        <WalletButton />
        <ButtonLink
          variant="primary"
          size="sm"
          href={PATHS.deploy}
          className="nav-deploy"
          aria-current={route.name === 'deploy' ? 'page' : undefined}
        >
          Deploy GPU
        </ButtonLink>
        <span className="topbar__progress" ref={pageProgressRef} aria-hidden="true" />
      </div>
    </header>
  );
}

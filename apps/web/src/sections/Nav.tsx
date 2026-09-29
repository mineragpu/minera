import { ButtonLink } from '../components/Button.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
import { useSectionSpy } from '../motion/useSectionSpy.ts';
import { NAV_LINKS } from './navLinks.ts';
import './nav.css';

export function Nav() {
  const current = useSectionSpy();
  return (
    <header className="topbar" id="top">
      <div className="topbar__inner">
        <Wordmark />
        <nav className="topnav" aria-label="Primary">
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.id}>
                <a href={`#${link.id}`} aria-current={link.id === current ? 'location' : undefined}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <ButtonLink variant="primary" size="sm" href="#deploy" className="nav-deploy">
          Deploy GPU
        </ButtonLink>
      </div>
    </header>
  );
}

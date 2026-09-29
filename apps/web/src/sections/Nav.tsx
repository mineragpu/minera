import { ButtonLink } from '../components/Button.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
import { NAV_LINKS } from './navLinks.ts';
import './nav.css';

export function Nav() {
  return (
    <header className="topbar" id="top">
      <div className="topbar__inner">
        <Wordmark />
        <nav className="topnav" aria-label="Primary">
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.id}>
                <a href={`#${link.id}`}>{link.label}</a>
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

import { BRAND } from '@dayagpu/shared';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
import { NAV_LINKS } from './navLinks.ts';
import './footer.css';

export function Footer() {
  return (
    <footer className="foot shell">
      <div className="foot__inner">
        <Wordmark />
        <nav aria-label="Footer">
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.id}>
                <a href={`#${link.id}`}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="foot__note">
          <PreviewTag />
          <span>Every figure on this page is example data until the network goes live.</span>
          <span className="brand-story">{BRAND.meaning}</span>
          <span className="copy">
            © {new Date().getFullYear()} <span className="brand">{BRAND.name}</span>
          </span>
        </p>
      </div>
    </footer>
  );
}

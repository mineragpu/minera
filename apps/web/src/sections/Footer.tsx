import { BRAND } from '@dayagpu/shared';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
import { FOOTER_LINKS } from './navLinks.ts';
import './footer.css';

export function Footer() {
  return (
    <footer className="foot shell">
      <div className="foot__inner">
        <Wordmark />
        <nav aria-label="Footer">
          <ul>
            {FOOTER_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="foot__note">
          <PreviewTag />
          <span>marks a figure that is still illustrative. Every other figure is read from the network.</span>
          <span className="brand-story">{BRAND.meaning}</span>
          <span className="copy">
            © {new Date().getFullYear()} <span className="brand">{BRAND.name}</span>
          </span>
        </p>
      </div>
    </footer>
  );
}

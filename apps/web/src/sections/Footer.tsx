import { BRAND } from '@dayagpu/shared';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
import { FOOTER_GROUPS } from './navLinks.ts';
import './footer.css';

export function Footer() {
  return (
    <footer className="foot shell">
      <div className="foot__inner">
        <div className="foot__brand">
          <Wordmark />
          <p className="foot__tagline">{BRAND.tagline}</p>
          <p className="brand-story">{BRAND.meaning}</p>
        </div>
        <nav className="foot__map" aria-label="Sitemap">
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title} className="foot__group">
              <h2 className="foot__title">{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="foot__note">
          <span className="foot__legend">
            <PreviewTag /> marks a figure that is still illustrative. Every other figure is read from the network.
          </span>
          <span className="copy">
            © {new Date().getFullYear()} <span className="brand">{BRAND.name}</span>
          </span>
        </p>
      </div>
    </footer>
  );
}

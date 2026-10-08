import { BRAND } from '@minera/shared';
import { PreviewTag } from '../components/PreviewTag.tsx';
import { TokenAddress } from '../components/TokenAddress.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
import { revealRef } from '../motion/revealObserver.ts';
import { FOOTER_GROUPS } from './navLinks.ts';
import './footer.css';

export function Footer() {
  return (
    <footer className="foot shell" ref={revealRef} data-reveal="foot">
      <div className="foot__inner">
        <div className="foot__brand" ref={revealRef} data-reveal="fade-up">
          <Wordmark />
          <p className="foot__tagline">{BRAND.tagline}</p>
          <p className="brand-story">{BRAND.meaning}</p>
        </div>
        <nav className="foot__map" aria-label="Sitemap">
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title} className="foot__group" ref={revealRef} data-reveal="fade-up">
              <h2 className="foot__title">{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('http') ? (
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      <a href={link.href}>{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="foot__note" ref={revealRef} data-reveal="fade">
          <span className="foot__legend">
            <PreviewTag /> marks a figure that is still illustrative. Every other figure is read from the network.
          </span>
          <TokenAddress explorer className="foot__token" />
          <span className="copy">
            © {new Date().getFullYear()} <span className="brand">{BRAND.name}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

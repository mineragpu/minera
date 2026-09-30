import { BRAND } from '@minera/shared';
import { PATHS } from '../router/routes.ts';
import './wordmark.css';

/**
 * The brand mark and name. The mark is `marketing/brand/logo-icon.svg` cropped to its box, with the
 * gold point drawn as its own shape. At 24 px tall every vertical edge falls on a whole pixel.
 */
export function Wordmark() {
  return (
    <a className="wordmark" href={PATHS.home}>
      <svg viewBox="7.5 15 105 90" aria-hidden="true" focusable="false">
        <path d="M7.5 97.5H51.84L58.09 105H7.5ZM112.5 105H61.91L68.16 97.5H112.5Z" fill="#8C97A8" />
        <path d="M7.5 15 30 42V90H7.5Z" fill="url(#g-rig-lit)" />
        <path d="M112.5 15 90 42V90H112.5Z" fill="url(#g-rig-steel)" />
        <path d="M37.5 51 60 78V101.43L37.5 74.43Z" fill="url(#g-rig-lit)" />
        <path d="M82.5 51 60 78V101.43L82.5 74.43Z" fill="url(#g-rig-steel)" />
        <path d="M47.5 86.43H72.5L60 101.43Z" fill="url(#g-rig-gold)" />
      </svg>
      <span className="brand">{BRAND.name}</span>
    </a>
  );
}

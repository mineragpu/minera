import { BRAND } from '@dayagpu/shared';
import { PATHS } from '../router/routes.ts';
import './wordmark.css';

export function Wordmark() {
  return (
    <a className="wordmark" href={PATHS.home}>
      <svg viewBox="0 0 26 28" aria-hidden="true" focusable="false">
        <path d="M13 1.5 24.5 8 13 14.5 1.5 8Z" fill="url(#g-top)" />
        <path d="M1.5 8 13 14.5V27L1.5 20.5Z" fill="url(#g-left)" />
        <path d="M24.5 8 13 14.5V27L24.5 20.5Z" fill="url(#g-right)" />
        <path
          d="M18.75 4.75 7.25 11.25M7.25 4.75 18.75 11.25M7.25 11.25V23.75M1.5 14.25 13 20.75M18.75 11.25V23.75M24.5 14.25 13 20.75"
          stroke="#0B0E14"
          strokeOpacity=".6"
          strokeWidth=".9"
          fill="none"
        />
        <path
          d="M13 1.5 24.5 8V20.5L13 27 1.5 20.5V8Z M1.5 8 13 14.5 24.5 8 M13 14.5V27"
          fill="none"
          stroke="url(#g-iri)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="brand">{BRAND.name}</span>
    </a>
  );
}

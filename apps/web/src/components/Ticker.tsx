import { BRAND } from '@dayagpu/shared';

export function Ticker() {
  return <span className="ticker">${BRAND.symbol}</span>;
}

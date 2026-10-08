import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { BRAND } from './brand.ts';
import { TOKEN } from './token.ts';

// An EVM address, or a base58 address as used by chains outside the EVM.
const ADDRESS = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

describe('TOKEN', () => {
  it('uses the brand ticker', () => {
    assert.equal(TOKEN.symbol, BRAND.symbol);
  });

  it('has no address before deployment, or a well-formed one after', () => {
    if (TOKEN.address !== null) assert.match(TOKEN.address, ADDRESS);
  });

  it('points every link at the same address', () => {
    if (TOKEN.address === null) return;
    for (const url of [TOKEN.marketUrl, TOKEN.explorerUrl]) {
      if (url !== null) assert.ok(url.toLowerCase().includes(TOKEN.address.toLowerCase()), url);
    }
  });

  it('dates the launch only once there is an address', () => {
    if (TOKEN.launchedOn === null) return;
    assert.notEqual(TOKEN.address, null);
    assert.match(TOKEN.launchedOn, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('links only over https, and only once there is an address to link', () => {
    for (const url of [TOKEN.marketUrl, TOKEN.explorerUrl]) {
      if (url === null) continue;
      assert.notEqual(TOKEN.address, null);
      assert.equal(new URL(url).protocol, 'https:');
    }
  });
});

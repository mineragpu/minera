import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEPLOYMENTS } from './deployments.ts';
import { ETH_PAIR, PAIR_LISTINGS, findPair, pairListingFor } from './pairs.ts';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const deployConfigs = new URL('../../contracts/deploy/', import.meta.url);

describe('PAIR_LISTINGS', () => {
  it('lists pairs for every chain the contracts were deployed to', () => {
    assert.deepEqual(Object.keys(PAIR_LISTINGS).sort(), Object.keys(DEPLOYMENTS).sort());
  });

  for (const [chainId, listing] of Object.entries(PAIR_LISTINGS)) {
    it(`starts chain ${chainId} with ETH at address zero`, () => {
      const [first, ...rest] = listing.assets;
      assert.equal(first?.address, ETH_PAIR);
      assert.equal(first?.kind, 'native');
      assert.ok(rest.every((asset) => asset.kind === 'stock'));
    });

    it(`holds well-formed, distinct assets on chain ${chainId}`, () => {
      const seen = new Set<string>();
      for (const asset of listing.assets) {
        assert.match(asset.address, ADDRESS);
        assert.ok(asset.symbol.length > 0);
        assert.ok(Number.isInteger(asset.decimals) && asset.decimals >= 0);
        assert.ok(!seen.has(asset.address.toLowerCase()), asset.address);
        seen.add(asset.address.toLowerCase());
      }
      if (listing.quoter !== null) assert.match(listing.quoter, ADDRESS);
    });
  }

  for (const name of readdirSync(deployConfigs).filter((file) => file.endsWith('.json'))) {
    it(`matches the zap routes in deploy/${name}`, () => {
      const config = JSON.parse(readFileSync(new URL(name, deployConfigs), 'utf8'));
      const routed = config.routes.map((route: { asset: string }) => route.asset.toLowerCase()).sort();
      const listed = pairListingFor(config.chainId)
        .assets.filter((asset) => asset.kind === 'stock')
        .map((asset) => asset.address.toLowerCase())
        .sort();
      assert.deepEqual(listed, routed);
    });
  }
});

describe('pairListingFor', () => {
  it('falls back to ETH alone on a chain with no listing', () => {
    const listing = pairListingFor(1);
    assert.deepEqual(
      listing.assets.map((asset) => asset.address),
      [ETH_PAIR],
    );
    assert.equal(listing.quoter, null);
  });
});

describe('findPair', () => {
  it('matches an address in any case', () => {
    const stock = PAIR_LISTINGS[46630]?.assets[1];
    assert.ok(stock);
    assert.equal(findPair(46630, stock.address.toUpperCase().replace('0X', '0x')), stock);
    assert.equal(findPair(46630, stock.address.toLowerCase()), stock);
  });

  it('returns nothing for an unlisted asset', () => {
    assert.equal(findPair(46630, '0x000000000000000000000000000000000000dead'), undefined);
  });
});

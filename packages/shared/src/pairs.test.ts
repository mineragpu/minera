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

  // The app lists the stocks a deployed zap routes. A network's deploy config holds the routes of
  // the zap deployed with its contracts; a separate `<network>-zap.json` holds a zap deployed
  // later, and it replaces the first only once DEPLOYMENTS records it. Until then it lists nothing.
  // Configs without routes, such as a work bond's, describe no zap and are left out.
  const configs = readdirSync(deployConfigs)
    .filter((file) => file.endsWith('.json'))
    .map((name) => ({ name, config: JSON.parse(readFileSync(new URL(name, deployConfigs), 'utf8')) }))
    .filter(({ config }) => Array.isArray(config.routes));
  const routesOf = (config: { routes: { asset: string }[] }) =>
    config.routes.map((route) => route.asset.toLowerCase()).sort();
  const zapIsDeployed = (chainId: number) => (DEPLOYMENTS[chainId]?.pairZap ?? ETH_PAIR) !== ETH_PAIR;

  for (const { name, config } of configs) {
    const separateZap = name.endsWith('-zap.json');
    const replaced =
      !separateZap &&
      zapIsDeployed(config.chainId) &&
      configs.some((other) => other.name.endsWith('-zap.json') && other.config.chainId === config.chainId);
    if (replaced) continue;
    it(`lists what deploy/${name} routes, once its zap is deployed`, () => {
      const expected = separateZap && !zapIsDeployed(config.chainId) ? [] : routesOf(config);
      const listed = pairListingFor(config.chainId)
        .assets.filter((asset) => asset.kind === 'stock')
        .map((asset) => asset.address.toLowerCase())
        .sort();
      assert.deepEqual(listed, expected);
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

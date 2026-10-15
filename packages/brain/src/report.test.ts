import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { MineraApi } from '@minera-gpu/mcp/api';
import type { Facts } from './facts.ts';
import { buildReport, draftPosts, holdReason, xLength } from './report.ts';

const FACTS: Facts = {
  network: 'mainnet',
  chainId: 4663,
  rigsTotal: 12,
  rigsOnline: 9,
  verifiedUnits24h: '1234567',
  answers24h: 4321,
  poolBurned: '1500000000000000',
  poolCommitted: '250000000000000',
  campaignBurns: 3,
  epoch: 497791,
  topRigs: ['mufty', 'atlas'],
  asOf: '2026-10-15T07:57:11.000Z',
};

const NOW = new Date('2026-10-15T09:00:00Z');
const KEPT = { kind: 'kept', text: 'Nine rigs kept watch, and each answer was checked twice.', jobId: 'job-1' } as const;
const SKIPPED = { kind: 'skipped', reason: 'not asked' } as const;

describe('xLength', () => {
  it('counts a link and the bare site address as 23 characters each', () => {
    assert.equal(xLength('mineragpu.tech'), 23);
    assert.equal(xLength('see https://mineragpu.tech/#agents'), 4 + 23);
    assert.equal(xLength('mineragpu.tech/docs/api'), 23);
    assert.equal(xLength('plain'), 5);
  });
});

describe('draftPosts', () => {
  it('writes the figures with code and ends on the site', () => {
    const { x, telegram } = draftPosts(FACTS, SKIPPED, NOW);
    assert.equal(
      x,
      'Minera, October 15.\n\n9 of 12 rigs online. 1,234,567 units of verified work in the last 24 hours. 0.0015 ETH burned into the Burn Pool so far.\n\nmineragpu.tech',
    );
    assert.match(telegram, /^Minera Brain report, October 15\n/);
    assert.match(telegram, /Answers, last 24 hours: 4,321/);
    assert.match(telegram, /0\.0015 ETH \(0\.00025 committed to settlements\)/);
    assert.match(telegram, /Most verified work this epoch: mufty, atlas/);
    assert.doesNotMatch(telegram, /Written by the network/);
  });

  it('adds a kept sentence with how it was checked', () => {
    const { x, telegram } = draftPosts(FACTS, KEPT, NOW);
    assert.match(x, /"Nine rigs kept watch, and each answer was checked twice\."\nWritten by the network, checked by two rigs\./);
    assert.match(telegram, /Written by the network, checked by two rigs\./);
    assert.ok(xLength(x) <= 280);
  });

  it('drops the sentence from X rather than go past 280 characters', () => {
    const long = { ...KEPT, text: 'word '.repeat(39).trim() };
    const { x, telegram } = draftPosts({ ...FACTS, verifiedUnits24h: '123456789012345' }, long, NOW);
    assert.ok(xLength(x) <= 280);
    assert.doesNotMatch(x, /Written by the network/);
    assert.match(telegram, /Written by the network/);
  });
});

describe('holdReason', () => {
  it('holds a day with no rig online and no verified work', () => {
    assert.match(String(holdReason({ ...FACTS, rigsOnline: 0, verifiedUnits24h: '0' })), /idle network/);
  });

  it('lets a day with work through, even when every rig has since gone offline', () => {
    assert.equal(holdReason(FACTS), null);
    assert.equal(holdReason({ ...FACTS, rigsOnline: 0 }), null);
  });
});

describe('buildReport', () => {
  const api: MineraApi = {
    baseUrl: 'https://api.example',
    async get(path) {
      if (path === '/v1/network') return { network: 'mainnet', chainId: 4663, rigs: { total: 1, online: 0 }, pool: { totalBurned: '1000000000000000' } };
      return { rigs: [] };
    },
    async post() {
      throw new Error('a report without --ask never posts');
    },
  };

  it('drafts without asking the network unless told to', async () => {
    const report = await buildReport({ api, ask: false, now: NOW });
    assert.equal(report.thought.kind, 'skipped');
    assert.match(report.markdown, /^# Minera Brain draft, 2026-10-15 \(mainnet\)\n/);
    assert.match(report.markdown, /A draft for a person to approve before anything is posted/);
    assert.match(report.markdown, /Figures read from https:\/\/api\.example; the pool as of unknown\./);
    assert.match(report.markdown, /None this time: not asked \(run with --ask to ask the network\)\./);
    assert.match(report.markdown, /\| Rigs online \/ total \| 0 \/ 1 \|/);
    assert.match(report.markdown, /\*\*Hold:\*\* no rig is online and no work was verified/);
    assert.match(report.markdown, new RegExp(`## X \\(${xLength(report.posts.x)} of 280 characters\\)`));
  });

  it('asks nothing when asked to but no rig is online', async () => {
    const report = await buildReport({ api, ask: true, now: NOW });
    assert.deepEqual(report.thought, { kind: 'skipped', reason: 'no rigs online, so nothing was asked' });
  });
});

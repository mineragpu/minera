import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { MineraApi } from '@minera-gpu/mcp/api';
import type { Facts } from './facts.ts';
import { askThought, guardThought, thoughtPrompt } from './thought.ts';

const FACTS: Facts = {
  network: 'mainnet',
  chainId: 4663,
  rigsTotal: 12,
  rigsOnline: 9,
  verifiedUnits24h: '1234567',
  answers24h: 4321,
  poolBurned: '1500000000000000',
  poolCommitted: '0',
  campaignBurns: 3,
  epoch: 497791,
  topRigs: [],
  asOf: '',
};

const OPTIONS = { sleep: async () => {}, intervalMs: 1, timeoutMs: 10 };

/** A coordinator that queues the prompt and answers the job view it is given. */
function network(view: Record<string, unknown>) {
  const posted: unknown[] = [];
  const api: MineraApi = {
    baseUrl: 'https://api.example',
    async get() {
      return { id: 'job-1', status: 'done', ...view };
    },
    async post(path, body) {
      posted.push([path, body]);
      return { id: 'job-1', status: 'queued' };
    },
  };
  return { api, posted };
}

describe('guardThought', () => {
  it('lets a calm sentence through', () => {
    assert.equal(guardThought('A quiet day, and every answer that counted was checked twice.'), null);
  });

  it('refuses figures, links, marks and price talk', () => {
    assert.equal(guardThought(''), 'empty');
    assert.equal(guardThought('x'.repeat(201)), 'too long');
    assert.equal(guardThought('One line.\nTwo lines.'), 'more than one line');
    assert.equal(guardThought('Nine rigs, 9 answers.'), 'contains a figure');
    assert.equal(guardThought('Read more at mineragpu.tech'), 'contains a link');
    assert.equal(guardThought('What a day!'), 'contains !, a dash, a hashtag, a mention or a $');
    assert.equal(guardThought('Work \u2014 then rest.'), 'contains !, a dash, a hashtag, a mention or a $');
    assert.equal(guardThought('Work \u2013 then rest.'), 'contains !, a dash, a hashtag, a mention or a $');
    assert.equal(guardThought('Time to buy the dip.'), 'contains "buy"');
    assert.equal(guardThought('The price of patience is small.'), 'contains "price"');
  });
});

describe('thoughtPrompt', () => {
  it('states the figures and asks for one sentence without numbers', () => {
    const prompt = thoughtPrompt(FACTS);
    assert.match(prompt, /9 of 12 rigs online/);
    assert.match(prompt, /1234567 units of verified work/);
    assert.match(prompt, /one short, calm sentence/);
    assert.match(prompt, /no numbers, no prices, no predictions/);
  });
});

describe('askThought', () => {
  it('asks nothing when no rig is online', async () => {
    const { api, posted } = network({});
    const thought = await askThought(api, { ...FACTS, rigsOnline: 0 }, OPTIONS);
    assert.deepEqual(thought, { kind: 'skipped', reason: 'no rigs online, so nothing was asked' });
    assert.deepEqual(posted, []);
  });

  it('asks a verified prompt and keeps a verified answer that passes the guard', async () => {
    const { api, posted } = network({ verification: 'verified', output: '"Nine rigs kept watch, and each answer was checked twice."' });
    const thought = await askThought(api, { ...FACTS }, OPTIONS);
    assert.deepEqual(thought, { kind: 'kept', text: 'Nine rigs kept watch, and each answer was checked twice.', jobId: 'job-1' });
    assert.deepEqual(posted, [['/v1/playground/jobs', { prompt: thoughtPrompt(FACTS), verify: true }]]);
  });

  it('skips an answer the two rigs disagreed on', async () => {
    const { api } = network({ verification: 'mismatch', output: 'A calm day on the network.' });
    assert.deepEqual(await askThought(api, FACTS, OPTIONS), {
      kind: 'skipped',
      reason: 'the answer was mismatch, not verified',
      jobId: 'job-1',
    });
  });

  it('skips an answer nobody cross-checked in time', async () => {
    const { api } = network({ status: 'checking', verification: 'pending', output: null });
    const thought = await askThought(api, FACTS, OPTIONS);
    assert.equal(thought.kind, 'skipped');
    assert.equal(thought.kind === 'skipped' && thought.reason, 'the answer was pending, not verified');
  });

  it('skips a verified answer the guard refuses', async () => {
    const { api } = network({ verification: 'verified', output: 'Nine rigs, 1,234,567 units!' });
    assert.deepEqual(await askThought(api, FACTS, OPTIONS), {
      kind: 'skipped',
      reason: 'the verified answer contains a figure',
      jobId: 'job-1',
    });
  });
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { BACKOFF_CAP_MS, createBackoff, sleep } from './wait.ts';

describe('createBackoff', () => {
  it('doubles the ceiling and stays within half and all of it', () => {
    const low = createBackoff({ random: () => 0 });
    const high = createBackoff({ random: () => 1 });
    assert.deepEqual([low.next(), low.next(), low.next(), low.next()], [500, 1_000, 2_000, 4_000]);
    assert.deepEqual([high.next(), high.next(), high.next(), high.next()], [1_000, 2_000, 4_000, 8_000]);
  });

  it('never waits more than sixty seconds', () => {
    const backoff = createBackoff({ random: () => 1 });
    const delays = Array.from({ length: 100 }, () => backoff.next());
    assert.equal(BACKOFF_CAP_MS, 60_000);
    assert.equal(Math.max(...delays), 60_000);
    assert.ok(delays.every((delay) => Number.isFinite(delay) && delay > 0));
  });

  it('adds jitter from the random source', () => {
    const values = [0.1, 0.9];
    const backoff = createBackoff({ baseMs: 1_000, random: () => values.shift() ?? 0 });
    assert.equal(backoff.next(), 550);
    assert.equal(backoff.next(), 1_900);
  });

  it('starts over after a reset', () => {
    const backoff = createBackoff({ random: () => 1 });
    backoff.next();
    backoff.next();
    backoff.reset();
    assert.equal(backoff.next(), 1_000);
  });
});

describe('sleep', () => {
  it('ends early when the signal aborts, without rejecting', async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 20);
    await sleep(10_000, controller.signal);
    assert.ok(Date.now() - started < 5_000);
  });

  it('returns at once for an aborted signal', async () => {
    await sleep(10_000, AbortSignal.abort());
  });

  it('waits the full time otherwise', async () => {
    const started = Date.now();
    await sleep(30);
    assert.ok(Date.now() - started >= 25);
  });
});

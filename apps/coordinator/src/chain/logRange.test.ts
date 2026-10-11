import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { afterRefusal, afterSuccess, initialLogRange, type LogRange, type LogRangeLimits } from './logRange.ts';

const limits: LogRangeLimits = { min: 10n, max: 100n, regrowAfter: 3 };

describe('log range', () => {
  it('starts at the configured size', () => {
    assert.deepEqual(initialLogRange(limits), { size: 100n, streak: 0 });
  });

  it('halves on a refusal, down to the smallest size', () => {
    let range: LogRange | null = initialLogRange(limits);
    const sizes: bigint[] = [];
    while ((range = afterRefusal(range, limits))) sizes.push(range.size);
    assert.deepEqual(sizes, [50n, 25n, 12n, 10n]);
  });

  it('gives up only once it is at the smallest size', () => {
    assert.equal(afterRefusal({ size: 10n, streak: 5 }, limits), null);
    assert.deepEqual(afterRefusal({ size: 11n, streak: 5 }, limits), { size: 10n, streak: 0 });
  });

  it('doubles after a run of accepted requests, up to the configured size', () => {
    let range: LogRange = { size: 10n, streak: 0 };
    const sizes: bigint[] = [];
    for (let i = 0; i < 12; i++) {
      range = afterSuccess(range, limits, false);
      sizes.push(range.size);
    }
    assert.deepEqual(sizes, [10n, 10n, 20n, 20n, 20n, 40n, 40n, 40n, 80n, 80n, 80n, 100n]);
  });

  it('counts the run again after a refusal', () => {
    let range: LogRange = { size: 40n, streak: 2 };
    range = afterRefusal(range, limits)!;
    assert.deepEqual(range, { size: 20n, streak: 0 });
    range = afterSuccess(range, limits, false);
    assert.deepEqual(range, { size: 20n, streak: 1 });
  });

  it('returns to the configured size once caught up', () => {
    assert.deepEqual(afterSuccess({ size: 10n, streak: 1 }, limits, true), { size: 100n, streak: 0 });
  });
});

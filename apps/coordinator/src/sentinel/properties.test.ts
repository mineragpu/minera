import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { normalizeOutput } from '../jobs/normalize.ts';
import { measureUnits } from '../jobs/units.ts';
import { outputsMatch } from '../jobs/verify.ts';
import { requestBudget } from './budget.ts';
import { passesCanary } from './canary.ts';
import { networkKey, subnetOf } from './network.ts';
import { SENTINEL_POLICY } from './policy.ts';
import { belowFloor, withSample } from './speed.ts';
import { paidUnits } from './standing.ts';

const SALT = 'property-salt-0123456789';
const octet = fc.integer({ min: 0, max: 255 });
const hextet = fc.integer({ min: 0, max: 0xffff });
const text = fc.string({ maxLength: 400 });
const spacing = fc.constantFrom(' ', '  ', '\n', '\t', ' \n ');
const words = fc.array(fc.string({ minLength: 1, maxLength: 12 }).filter((word) => /^\S+$/.test(word)));
const answers = fc.string({ minLength: 1, maxLength: 200 }).filter((answer) => answer.trim().length > 0);
const samples = fc.array(fc.double({ min: 0, max: 1_000, noNaN: true }), { maxLength: 30 });
const floors = fc.double({ min: 1, max: 500, noNaN: true });
const request = fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 179_999 }));
const requests = fc.array(request, { maxLength: 400 });

describe('network properties', () => {
  it('puts every IPv4 address in its /24, however it is written', () => {
    fc.assert(
      fc.property(octet, octet, octet, octet, octet, (a, b, c, d, e) => {
        assert.equal(subnetOf(`${a}.${b}.${c}.${d}`), `4:${a}.${b}.${c}`);
        assert.equal(subnetOf(`::ffff:${a}.${b}.${c}.${d}`), subnetOf(`${a}.${b}.${c}.${e}`));
      }),
    );
  });

  it('puts every IPv6 address in its /48, compressed or not', () => {
    fc.assert(
      fc.property(fc.array(hextet, { minLength: 8, maxLength: 8 }), (groups) => {
        const full = groups.map((group) => group.toString(16).padStart(4, '0')).join(':');
        const head = groups
          .slice(0, 3)
          .map((group) => group.toString(16))
          .join(':');
        assert.equal(subnetOf(full), `6:${head}`);
        assert.equal(subnetOf(`${head}::1`), `6:${head}`);
      }),
    );
  });

  it('never returns the address, and never collides across neighboring subnets', () => {
    fc.assert(
      fc.property(octet, octet, octet, octet, (a, b, c, d) => {
        const key = networkKey(`${a}.${b}.${c}.${d}`, SALT);
        assert.ok(key !== null && /^[0-9a-f]{24}$/.test(key));
        assert.notEqual(networkKey(`${a}.${b}.${(c + 1) % 256}.${d}`, SALT), key);
      }),
    );
  });
});

describe('work measurement properties', () => {
  it('normalizes idempotently, so spacing never changes a comparison or a count', () => {
    fc.assert(
      fc.property(words, spacing, spacing, (list, a, b) => {
        const once = normalizeOutput(list.join(a));
        assert.equal(normalizeOutput(once), once);
        assert.equal(outputsMatch(list.join(a), `${b}${list.join(b)}${a}`), true);
        assert.equal(measureUnits(list.join(a), 10_000), measureUnits(list.join(b), 10_000));
      }),
    );
  });

  it('never measures more units than the job allows, nor fewer than zero', () => {
    fc.assert(
      fc.property(text, fc.integer({ min: 1, max: 4_096 }), (output, maxTokens) => {
        const units = measureUnits(output, maxTokens);
        assert.ok(units >= 0 && units <= maxTokens);
      }),
    );
  });
});

describe('sentinel properties', () => {
  it('passes the agreed answer and anything that starts with it, and nothing that alters its start', () => {
    fc.assert(
      fc.property(answers, text, (raw, tail) => {
        const answer = normalizeOutput(raw);
        assert.equal(passesCanary(raw, answer), true);
        if (answer.length >= SENTINEL_POLICY.canaryPrefixChars) {
          assert.equal(passesCanary(`${answer} ${tail}`, answer), true);
        }
        const altered = `${answer[0] === 'x' ? 'y' : 'x'}${answer.slice(1)}`;
        assert.equal(passesCanary(altered, answer), false);
      }),
    );
  });

  it('pays no standing more than the work, and the trusted exactly the work', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (units) => {
        assert.equal(paidUnits('trusted', units), units);
        assert.ok(paidUnits('probation', units) <= units && paidUnits('probation', units) * 2 >= units - 1);
        assert.equal(paidUnits('quarantined', units), 0);
      }),
    );
  });

  it('keeps only the newest samples, and decides nothing on too few or on one fast answer', () => {
    fc.assert(
      fc.property(samples, floors, (all, floor) => {
        const kept = all.reduce<number[]>((list, sample) => withSample(list, sample), []);
        assert.deepEqual(kept, all.slice(-SENTINEL_POLICY.speedSamples));
        if (kept.length < SENTINEL_POLICY.speedDecidingSamples) assert.equal(belowFloor(kept, floor), false);
        if (kept.some((sample) => sample >= floor)) assert.equal(belowFloor(kept, floor), false);
      }),
    );
  });

  it('lets no key through more than its budget in any minute', () => {
    fc.assert(
      fc.property(requests, (sent) => {
        const budget = requestBudget(SENTINEL_POLICY.requestsPerMinute);
        const allowed = new Map<string, number>();
        for (const [key, ms] of [...sent].sort((x, y) => x[1] - y[1])) {
          if (!budget.take(`key-${key}`, new Date(ms))) continue;
          const window = `${key}:${Math.floor(ms / 60_000)}`;
          allowed.set(window, (allowed.get(window) ?? 0) + 1);
        }
        for (const count of allowed.values()) assert.ok(count <= SENTINEL_POLICY.requestsPerMinute);
      }),
    );
  });
});

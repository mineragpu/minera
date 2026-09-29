import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { JobAssignment } from '@dayagpu/shared';
import {
  ProtocolError,
  parseHeartbeatResponse,
  parseHelloResponse,
  parseJobAssignment,
  parseJobResultResponse,
} from './schema.ts';

const job: JobAssignment = {
  id: 'job-1',
  kind: 'chat',
  model: 'alpha:7b',
  params: { temperature: 0, seed: 42, maxTokens: 256 },
  messages: [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Name a prime.' },
  ],
  deadlineSeconds: 120,
};

const rig = {
  nodeKey: '0x00000000000000000000000000000000000000aa',
  operator: '0x00000000000000000000000000000000000000bb',
  name: 'Night Shift',
  pair: '0x0000000000000000000000000000000000000000',
};

describe('parseJobAssignment', () => {
  it('accepts a well-formed job and keeps only known fields', () => {
    assert.deepEqual(parseJobAssignment({ ...job, extra: true }), job);
  });

  const broken: [string, unknown][] = [
    ['a missing id', { ...job, id: '' }],
    ['an id with control characters', { ...job, id: 'a\nb' }],
    ['an unknown kind', { ...job, kind: 'mine' }],
    ['a nonzero temperature', { ...job, params: { ...job.params, temperature: 0.7 } }],
    ['a fractional seed', { ...job, params: { ...job.params, seed: 1.5 } }],
    ['a zero token limit', { ...job, params: { ...job.params, maxTokens: 0 } }],
    ['no messages', { ...job, messages: [] }],
    ['an unknown role', { ...job, messages: [{ role: 'tool', content: 'x' }] }],
    ['a message without content', { ...job, messages: [{ role: 'user' }] }],
    ['a negative deadline', { ...job, deadlineSeconds: -1 }],
    ['a deadline that is not a number', { ...job, deadlineSeconds: '60' }],
    ['a prompt that is too long', { ...job, messages: [{ role: 'user', content: 'x'.repeat(1_000_001) }] }],
    ['a non-object', 'job-1'],
  ];
  for (const [label, value] of broken) {
    it(`rejects ${label}`, () => {
      assert.throws(() => parseJobAssignment(value), ProtocolError);
    });
  }
});

describe('parseHelloResponse', () => {
  it('accepts a reply with a benchmark', () => {
    const hello = parseHelloResponse({ rig, heartbeatSeconds: 15, benchmark: { ...job, kind: 'benchmark' } });
    assert.equal(hello.rig.name, 'Night Shift');
    assert.equal(hello.heartbeatSeconds, 15);
    assert.equal(hello.benchmark?.kind, 'benchmark');
  });

  it('accepts a reply without a benchmark', () => {
    assert.equal(parseHelloResponse({ rig, heartbeatSeconds: 15, benchmark: null }).benchmark, null);
  });

  it('rejects a reply that is not the protocol', () => {
    assert.throws(() => parseHelloResponse('<html>'), ProtocolError);
    assert.throws(() => parseHelloResponse({ rig: { ...rig, operator: '0x12' }, heartbeatSeconds: 15 }), ProtocolError);
    assert.throws(() => parseHelloResponse({ rig, heartbeatSeconds: 0 }), ProtocolError);
  });
});

describe('parseHeartbeatResponse', () => {
  it('keeps valid jobs and explains the ones it drops', () => {
    const reply = parseHeartbeatResponse({
      heartbeatSeconds: 10,
      jobs: [job, { ...job, id: 'job-2', params: { ...job.params, temperature: 1 } }],
    });
    assert.deepEqual(reply.jobs, [job]);
    assert.equal(reply.rejected.length, 1);
    assert.match(reply.rejected[0] ?? '', /job-2/);
  });

  it('treats missing jobs as none', () => {
    assert.deepEqual(parseHeartbeatResponse({ heartbeatSeconds: 10 }).jobs, []);
  });

  it('rejects jobs that are not a list', () => {
    assert.throws(() => parseHeartbeatResponse({ heartbeatSeconds: 10, jobs: {} }), ProtocolError);
  });
});

describe('parseJobResultResponse', () => {
  it('reads the verdict and a sanitized reason', () => {
    assert.deepEqual(parseJobResultResponse({ accepted: true }), { accepted: true });
    assert.deepEqual(parseJobResultResponse({ accepted: false, reason: 'late\u001b[0m' }), {
      accepted: false,
      reason: 'late [0m',
    });
    assert.throws(() => parseJobResultResponse({ accepted: 'yes' }), ProtocolError);
  });
});

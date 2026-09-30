import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { JobAssignment } from '@minera/shared';
import { createScheduler } from './scheduler.ts';

function job(id: string): JobAssignment {
  return {
    id,
    kind: 'chat',
    model: 'alpha:7b',
    params: { temperature: 0, seed: 1, maxTokens: 8 },
    messages: [{ role: 'user', content: 'hi' }],
    deadlineSeconds: 60,
  };
}

function controllable() {
  const started: string[] = [];
  const finishers = new Map<string, () => void>();
  const execute = (assignment: JobAssignment): Promise<void> =>
    new Promise((resolve) => {
      started.push(assignment.id);
      finishers.set(assignment.id, resolve);
    });
  const finish = async (id: string): Promise<void> => {
    finishers.get(id)?.();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { started, execute, finish };
}

describe('createScheduler', () => {
  it('runs one job at a time by default and starts the next when one finishes', async () => {
    const { started, execute, finish } = controllable();
    const scheduler = createScheduler(1, execute);
    assert.equal(scheduler.add([job('a'), job('b')]), 2);
    assert.deepEqual(started, ['a']);
    assert.equal(scheduler.running, 1);
    assert.equal(scheduler.queued, 1);
    await finish('a');
    assert.deepEqual(started, ['a', 'b']);
    await finish('b');
    assert.equal(scheduler.running, 0);
  });

  it('runs up to the concurrency limit in parallel', () => {
    const { started, execute } = controllable();
    const scheduler = createScheduler(3, execute);
    scheduler.add([job('a'), job('b'), job('c'), job('d')]);
    assert.deepEqual(started, ['a', 'b', 'c']);
    assert.equal(scheduler.queued, 1);
  });

  it('ignores a job id it has already seen', async () => {
    const { started, execute, finish } = controllable();
    const scheduler = createScheduler(1, execute);
    scheduler.add([job('a')]);
    assert.equal(scheduler.add([job('a'), job('b'), job('b')]), 1);
    await finish('a');
    await finish('b');
    assert.deepEqual(started, ['a', 'b']);
  });

  it('keeps going when a job rejects', async () => {
    const started: string[] = [];
    const scheduler = createScheduler(1, async (assignment) => {
      started.push(assignment.id);
      throw new Error('boom');
    });
    scheduler.add([job('a'), job('b')]);
    await scheduler.drained();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, ['a', 'b']);
  });

  it('drops the queue on close and resolves drained once running jobs end', async () => {
    const { started, execute, finish } = controllable();
    const scheduler = createScheduler(1, execute);
    scheduler.add([job('a'), job('b'), job('c')]);
    assert.equal(scheduler.close(), 2);
    assert.equal(scheduler.add([job('d')]), 0);

    let drained = false;
    const waiting = scheduler.drained().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drained, false);
    await finish('a');
    await waiting;
    assert.deepEqual(started, ['a']);
  });
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createLogger, type LogFormat } from './logger.ts';

function capture(format: LogFormat, quiet: boolean) {
  const out: string[] = [];
  const err: string[] = [];
  const logger = createLogger({
    format,
    quiet,
    stdout: { write: (chunk: string) => out.push(chunk) },
    stderr: { write: (chunk: string) => err.push(chunk) },
    now: () => new Date('2026-09-29T08:30:15.123Z'),
  });
  return { logger, out, err };
}

describe('createLogger', () => {
  it('writes timestamped lines, info to stdout and problems to stderr', () => {
    const { logger, out, err } = capture('text', false);
    logger.info('Connected.', { rig: 'a' });
    logger.warn('Coordinator unreachable.');
    logger.error('Stopped.');
    assert.deepEqual(out, ['2026-09-29T08:30:15Z Connected.\n']);
    assert.deepEqual(err, [
      '2026-09-29T08:30:15Z warning: Coordinator unreachable.\n',
      '2026-09-29T08:30:15Z error: Stopped.\n',
    ]);
  });

  it('keeps results, warnings and errors in quiet mode', () => {
    const { logger, out, err } = capture('text', true);
    logger.info('Heartbeat sent.');
    logger.result('Deploy code: 0x01');
    logger.warn('Slow runtime.');
    assert.deepEqual(out, ['2026-09-29T08:30:15Z Deploy code: 0x01\n']);
    assert.equal(err.length, 1);
  });

  it('writes one JSON object per line with its fields', () => {
    const { logger, out } = capture('json', false);
    logger.result('Node address: 0xabc', { nodeAddress: '0xabc', models: ['m1'] });
    assert.equal(out.length, 1);
    const line = out[0] ?? '';
    assert.ok(line.endsWith('\n'));
    assert.deepEqual(JSON.parse(line), {
      time: '2026-09-29T08:30:15.123Z',
      level: 'result',
      message: 'Node address: 0xabc',
      nodeAddress: '0xabc',
      models: ['m1'],
    });
  });

  it('neutralizes terminal control sequences and line breaks in text mode', () => {
    const { logger, out } = capture('text', false);
    logger.info('GPU: \u001b[31mred\u001b[0m\nnext\u202eline');
    assert.equal(out[0], '2026-09-29T08:30:15Z GPU:  [31mred [0m next line\n');
  });

  it('writes C1 controls and bidirectional overrides as escapes in JSON mode', () => {
    const { logger, err } = capture('json', false);
    const hostile = `a${String.fromCharCode(0x9b)}b${String.fromCharCode(0x202e)}c`;
    logger.warn(hostile, { reason: hostile });
    const line = err[0] ?? '';
    assert.ok([...line].every((character) => character.charCodeAt(0) < 0x7f), line);
    const parsed = JSON.parse(line) as { message: string; reason: string };
    assert.equal(parsed.message, hostile);
    assert.equal(parsed.reason, hostile);
  });

  it('prints preformatted text without a timestamp', () => {
    const { logger, out } = capture('text', true);
    logger.print('Usage:\n  rig status\n');
    assert.deepEqual(out, ['Usage:\n  rig status\n']);
  });
});

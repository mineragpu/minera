import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  CSV_QUERY,
  JSON_REPORT,
  describeGpu,
  detectGpu,
  parseCsvQuery,
  parseJsonReport,
  type CommandRunner,
} from './gpu.ts';

describe('parseCsvQuery', () => {
  it('reads name, memory and driver from a typical line', () => {
    assert.deepEqual(parseCsvQuery('Test Accelerator X1, 24564, 551.86, [N/A]\r\n'), {
      model: 'Test Accelerator X1',
      vramMb: 24564,
      driver: '551.86',
    });
  });

  it('takes the first GPU when several are listed', () => {
    const output = 'Card A, 16376, 550.54.15, GPU-0a1b2c3d-0000\nCard B, 8192, 550.54.15, GPU-0a1b2c3d-0001\n';
    assert.equal(parseCsvQuery(output)?.model, 'Card A');
  });

  it('keeps commas inside the name', () => {
    assert.deepEqual(parseCsvQuery('Board 7, Rev 2, 12288, 535.104, [N/A]'), {
      model: 'Board 7, Rev 2',
      vramMb: 12288,
      driver: '535.104',
    });
  });

  it('reads the card uuid when the driver reports one', () => {
    const line = 'Board 7, Rev 2, 12288, 535.104, GPU-3f2a9c1e-7b4d-4e8a-9c21-5d6e7f809a1b';
    assert.deepEqual(parseCsvQuery(line), {
      model: 'Board 7, Rev 2',
      vramMb: 12288,
      driver: '535.104',
      uuid: 'GPU-3f2a9c1e-7b4d-4e8a-9c21-5d6e7f809a1b',
    });
    assert.deepEqual(parseCsvQuery('Card A, 8192, 551.86, [N/A]'), { model: 'Card A', vramMb: 8192, driver: '551.86' });
  });

  it('drops a driver field it cannot trust but keeps the GPU', () => {
    assert.deepEqual(parseCsvQuery('Card A, 8192, [N/A], [N/A]'), { model: 'Card A', vramMb: 8192 });
    assert.deepEqual(parseCsvQuery('Card A, 8192, , '), { model: 'Card A', vramMb: 8192 });
  });

  it('skips malformed lines and falls through to a good one', () => {
    const lines = [
      'Card A, [N/A], 551.86, [N/A]',
      ', 8192, 551.86, [N/A]',
      '[N/A], 8192, 551.86, [N/A]',
      'Card B, 4096, 551.86',
      'Card C, 4096, 551.86, [N/A]',
    ];
    assert.equal(parseCsvQuery(lines.join('\n'))?.model, 'Card C');
  });

  it('returns null for errors, headers and empty output', () => {
    for (const output of [
      '',
      '\n\n',
      'Failed to initialize the driver library: Driver/library version mismatch',
      'No devices were found',
      'name, memory.total [MiB], driver_version, uuid',
      'Card A, 0, 551.86, [N/A]',
      'Card A, -1, 551.86, [N/A]',
      'Card A, 12 GB, 551.86, [N/A]',
    ]) {
      assert.equal(parseCsvQuery(output), null, JSON.stringify(output));
    }
  });

  it('strips control characters and caps the name length', () => {
    const info = parseCsvQuery(`\u001b[2J${'X'.repeat(300)}, 8192, 551.86, [N/A]`);
    assert.ok(info);
    assert.equal(info.model.length, 128);
    assert.ok(!info.model.includes('\u001b'));
  });
});

describe('parseJsonReport', () => {
  it('reads the product name and VRAM in bytes', () => {
    const report = JSON.stringify({
      card0: {
        'Card series': 'Test Accelerator R1',
        'Card model': '0x744c',
        'VRAM Total Memory (B)': '25753026560',
        'VRAM Total Used Memory (B)': '1024',
      },
      system: { 'Driver version': '6.8.5' },
    });
    assert.deepEqual(parseJsonReport(report), { model: 'Test Accelerator R1', vramMb: 24560, driver: '6.8.5' });
  });

  it('prefers the marketing name when present', () => {
    const report = JSON.stringify({
      card0: { 'Card Series': '0x7448', 'Marketing Name': 'Test Accelerator R2', 'VRAM Total Memory (B)': 17163091968 },
    });
    assert.deepEqual(parseJsonReport(report), { model: 'Test Accelerator R2', vramMb: 16368 });
  });

  it('reads the unique id and ignores one it cannot trust', () => {
    const card = { 'Card series': 'R3', 'VRAM Total Memory (B)': '8589934592' };
    const withId = JSON.stringify({ card0: { ...card, 'Unique ID': '0x1c7b4c2e8d5a9f03' } });
    assert.deepEqual(parseJsonReport(withId), { model: 'R3', vramMb: 8192, uuid: '0x1c7b4c2e8d5a9f03' });
    const badId = JSON.stringify({ card0: { ...card, 'Unique ID': 'N/A; rm -rf' } });
    assert.deepEqual(parseJsonReport(badId), { model: 'R3', vramMb: 8192 });
  });

  it('returns null for malformed reports', () => {
    for (const output of [
      '',
      'not json',
      '[]',
      'null',
      '{}',
      JSON.stringify({ card0: 'text' }),
      JSON.stringify({ card0: { 'Card series': 'R1' } }),
      JSON.stringify({ card0: { 'Card series': 'R1', 'VRAM Total Memory (B)': 'N/A' } }),
      JSON.stringify({ gpu0: { 'Card series': 'R1', 'VRAM Total Memory (B)': '1073741824' } }),
    ]) {
      assert.equal(parseJsonReport(output), null, output);
    }
  });
});

describe('detectGpu', () => {
  it('asks the CSV tool first, with a five-second limit', async () => {
    const calls: string[] = [];
    const run: CommandRunner = async (file, args, timeoutMs) => {
      calls.push(`${file} ${args.join(' ')} ${timeoutMs}`);
      return 'Card A, 8192, 551.86, [N/A]\n';
    };
    assert.equal((await detectGpu(run))?.model, 'Card A');
    assert.deepEqual(calls, [`${CSV_QUERY.file} ${CSV_QUERY.args.join(' ')} 5000`]);
  });

  it('falls back to the JSON report when the CSV tool is missing or says nothing useful', async () => {
    for (const csv of [null, 'No devices were found']) {
      const run: CommandRunner = async (file) =>
        file === JSON_REPORT.file
          ? JSON.stringify({ card0: { 'Card series': 'R1', 'VRAM Total Memory (B)': '8589934592' } })
          : csv;
      assert.deepEqual(await detectGpu(run), { model: 'R1', vramMb: 8192 });
    }
  });

  it('returns null when no tool answers', async () => {
    assert.equal(await detectGpu(async () => null), null);
  });
});

describe('describeGpu', () => {
  it('names the model, memory and driver', () => {
    const withDriver = describeGpu({ model: 'Card A', vramMb: 8192, driver: '551.86' });
    assert.equal(withDriver, 'Card A, 8192 MB VRAM, driver 551.86');
    assert.equal(describeGpu({ model: 'Card A', vramMb: 8192 }), 'Card A, 8192 MB VRAM');
  });
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseCommandLine, type Command } from './args.ts';

const OPERATOR = '0x52908400098527886E0F7030069857D2E4169EE7';

function command(argv: string[]): Command {
  const parsed = parseCommandLine(argv);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error);
  return parsed.command;
}

function error(argv: string[]): string {
  const parsed = parseCommandLine(argv);
  assert.ok(!parsed.ok, `expected ${argv.join(' ')} to be rejected`);
  return parsed.error;
}

describe('parseCommandLine', () => {
  it('reads init with a checksummed operator', () => {
    assert.deepEqual(command(['init', '--operator', OPERATOR]), {
      name: 'init',
      operator: OPERATOR,
      network: null,
      force: false,
    });
  });

  it('normalizes a lowercase operator to its checksum form', () => {
    const parsed = command(['code', '--operator', OPERATOR.toLowerCase(), '--network', 'mainnet']);
    assert.deepEqual(parsed, { name: 'code', operator: OPERATOR, network: 'mainnet' });
  });

  it('rejects a bad operator address', () => {
    assert.match(error(['init']), /--operator is required/);
    assert.match(error(['init', '--operator', '0x1234']), /40 hexadecimal characters/);
    assert.match(error(['init', '--operator', 'alice.eth']), /40 hexadecimal characters/);
    assert.match(error(['init', '--operator', `${OPERATOR}00`]), /40 hexadecimal characters/);
    assert.match(error(['init', '--operator', '0xZZ908400098527886E0F7030069857D2E4169EE7']), /hexadecimal/);
    assert.match(error(['init', '--operator', '0x52908400098527886E0F7030069857D2E4169Ee7']), /checksum/);
    assert.match(error(['init', '--operator', `0x${'0'.repeat(40)}`]), /zero address/);
    assert.match(error(['init', '--operator']), /--operator needs a value/);
  });

  it('rejects an unknown network', () => {
    assert.match(error(['init', '--operator', OPERATOR, '--network', 'devnet']), /testnet or mainnet/);
  });

  it('reads start with defaults', () => {
    assert.deepEqual(command(['start', '--coordinator', 'https://coord.example/api/']), {
      name: 'start',
      coordinator: 'https://coord.example/api',
      network: null,
      runtimeUrl: 'http://127.0.0.1:11434',
      concurrency: 1,
    });
    assert.equal((command(['start']) as { coordinator: string | null }).coordinator, null);
  });

  it('requires https for a remote coordinator', () => {
    assert.match(error(['start', '--coordinator', 'http://coord.example']), /must use https/);
    assert.match(error(['start', '--coordinator', 'coord.example']), /full URL/);
    assert.match(error(['start', '--coordinator', 'https://user:pass@coord.example']), /user name or password/);
    assert.match(error(['start', '--coordinator', 'ftp://coord.example']), /must use https/);
    const local = command(['start', '--coordinator', 'http://localhost:8787']) as { coordinator: string };
    assert.equal(local.coordinator, 'http://localhost:8787');
  });

  it('accepts a runtime URL over http or https', () => {
    const parsed = command(['status', '--runtime-url', 'http://10.0.0.5:11434/']);
    assert.deepEqual(parsed, { name: 'status', network: null, runtimeUrl: 'http://10.0.0.5:11434' });
    assert.match(error(['status', '--runtime-url', 'file:///tmp/socket']), /http or https/);
  });

  it('bounds the concurrency from 1 to 4', () => {
    assert.equal((command(['start', '--concurrency', '4']) as { concurrency: number }).concurrency, 4);
    for (const value of ['0', '5', '1.5', '-1', 'two', '']) {
      assert.match(error(['start', `--concurrency=${value}`]), /from 1 to 4/, value);
    }
  });

  it('rejects options that do not apply and unknown input', () => {
    assert.match(error(['start', '--force']), /--force does not apply to start/);
    assert.match(error(['status', '--operator', OPERATOR]), /--operator does not apply to status/);
    assert.match(error(['launch']), /Unknown command "launch"/);
    assert.match(error(['status', 'now']), /Unexpected argument "now"/);
    assert.match(error(['status', '--verbose']), /Unknown option --verbose/);
  });

  it('shows help and the version on request', () => {
    assert.deepEqual(command([]), { name: 'help' });
    assert.deepEqual(command(['help']), { name: 'help' });
    assert.deepEqual(command(['start', '--help']), { name: 'help' });
    assert.deepEqual(command(['--version']), { name: 'version' });
  });

  it('reads the output mode even when the rest is invalid', () => {
    const parsed = parseCommandLine(['init', '--json', '-q', '--operator', 'nope']);
    assert.deepEqual(parsed.output, { json: true, quiet: true });
    assert.equal(parsed.ok, false);
  });
});

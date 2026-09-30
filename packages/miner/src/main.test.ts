import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CHAINS, NODE_ROUTES, type Hex } from '@minera/shared';
import { getAddress, recoverMessageAddress } from 'viem';
import { deployDigest, deployTargetFor } from './deploy-code.ts';
import { main, type MainEnvironment } from './main.ts';
import { signerOf, startMockServer } from './mock-server.ts';
import { nodePaths } from './paths.ts';

const OPERATOR = getAddress('0x52908400098527886e0f7030069857d2e4169ee7');
const root = mkdtempSync(join(tmpdir(), 'rig-main-'));
after(() => rmSync(root, { recursive: true, force: true }));

interface Run {
  code: number;
  out: string;
  err: string;
}

function environment(home: string, stopSignal?: (fire: () => void) => void): MainEnvironment {
  return {
    stdout: { write: () => true },
    stderr: { write: () => true },
    paths: { platform: 'linux', env: { XDG_CONFIG_HOME: home }, home },
    detectGpu: async () => ({ model: 'Card A', vramMb: 8192, driver: '551.86' }),
    onStopSignal: (handler) => {
      stopSignal?.(handler);
      return () => undefined;
    },
  };
}

async function run(argv: string[], env: MainEnvironment): Promise<Run> {
  let out = '';
  let err = '';
  const code = await main(argv, {
    ...env,
    stdout: { write: (chunk: string) => (out += chunk) },
    stderr: { write: (chunk: string) => (err += chunk) },
  });
  return { code, out, err };
}

function fresh(name: string): { home: string; key: string } {
  const home = join(root, name);
  return { home, key: nodePaths({ platform: 'linux', env: { XDG_CONFIG_HOME: home }, home }).key };
}

describe('rig init and rig code', () => {
  it('creates a key and prints a deploy code for the operator, never the private key', async () => {
    const { home, key } = fresh('init');
    const result = await run(['init', '--operator', OPERATOR, '--json'], environment(home));
    assert.equal(result.code, 0, result.err);

    const lines = result.out.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    const nodeAddress = lines.find((line) => 'nodeAddress' in line)?.['nodeAddress'];
    const deployCode = lines.find((line) => 'deployCode' in line)?.['deployCode'] as Hex;
    const stored = JSON.parse(readFileSync(key, 'utf8')) as { address: string; privateKey: string };
    assert.equal(nodeAddress, stored.address);
    assert.ok(!result.out.includes(stored.privateKey.slice(2)), 'the private key must never be printed');
    assert.ok(!result.err.includes(stored.privateKey.slice(2)));

    const target = deployTargetFor('testnet');
    assert.ok(target);
    const digest = deployDigest(target.chainId, target.registry, OPERATOR);
    assert.equal(await recoverMessageAddress({ message: { raw: digest }, signature: deployCode }), stored.address);
    assert.ok(lines.some((line) => String(line['message']).startsWith('Paste the deploy code into the Deploy page')));
  });

  it('refuses to replace a key without --force and reprints the same code with rig code', async () => {
    const { home, key } = fresh('again');
    const first = await run(['init', '--operator', OPERATOR], environment(home));
    const original = readFileSync(key, 'utf8');
    const second = await run(['init', '--operator', OPERATOR], environment(home));
    assert.equal(second.code, 1);
    assert.match(second.err, /already exists/);
    assert.equal(readFileSync(key, 'utf8'), original);

    const code = await run(['code', '--operator', OPERATOR], environment(home));
    assert.equal(code.code, 0);
    const deployLine = (text: string) => /Deploy code: (0x[0-9a-f]+)/.exec(text)?.[1];
    assert.ok(deployLine(first.out));
    assert.equal(deployLine(code.out), deployLine(first.out));

    const forced = await run(['init', '--operator', OPERATOR, '--force'], environment(home));
    assert.equal(forced.code, 0);
    assert.notEqual(readFileSync(key, 'utf8'), original);
  });

  const mainnetDeployed = deployTargetFor('mainnet') !== null;
  it('creates nothing for a network without a registry', { skip: mainnetDeployed }, async () => {
    const { home, key } = fresh('mainnet');
    const result = await run(['init', '--operator', OPERATOR, '--network', 'mainnet'], environment(home));
    assert.equal(result.code, 1);
    assert.match(result.err, /not deployed on mainnet/);
    assert.equal(existsSync(key), false);
  });

  it('asks for init before printing a code', async () => {
    const { home } = fresh('no-key');
    const result = await run(['code', '--operator', OPERATOR], environment(home));
    assert.equal(result.code, 1);
    assert.match(result.err, /No node key found/);
  });
});

describe('rig start', () => {
  it('exits with code 2 and says what to install when no runtime answers', async () => {
    const { home } = fresh('no-runtime');
    await run(['init', '--operator', OPERATOR], environment(home));
    const closed = await startMockServer(() => ({ json: {} }));
    await closed.close();
    const result = await run(
      ['start', '--coordinator', 'https://coordinator.invalid', '--runtime-url', closed.url],
      environment(home),
    );
    assert.equal(result.code, 2);
    assert.match(result.err, /compatible with the \/api\/chat interface/);
  });

  it('requires a coordinator URL the first time', async () => {
    const { home } = fresh('no-coordinator');
    await run(['init', '--operator', OPERATOR], environment(home));
    const result = await run(['start'], environment(home));
    assert.equal(result.code, 64);
    assert.match(result.err, /No coordinator URL is set for testnet/);
  });

  it('refuses a saved coordinator URL that is not https', async () => {
    const { home } = fresh('saved-http');
    await run(['init', '--operator', OPERATOR], environment(home));
    const paths = nodePaths({ platform: 'linux', env: { XDG_CONFIG_HOME: home }, home });
    const settings = { network: 'testnet', coordinators: { testnet: 'http://coord.example' } };
    writeFileSync(paths.settings, JSON.stringify(settings));
    const result = await run(['start'], environment(home));
    assert.equal(result.code, 64);
    assert.match(result.err, /saved coordinator URL for testnet must use https/);
  });

  it('connects, heartbeats with a signed request and stops cleanly on a signal', async () => {
    const { home } = fresh('start');
    await run(['init', '--operator', OPERATOR], environment(home));
    const runtime = await startMockServer((request) =>
      request.url === '/api/version' ? { json: { version: '0.12.3' } } : { json: { models: [{ name: 'alpha:7b' }] } },
    );
    let stop = (): void => undefined;
    const coordinator = await startMockServer(async (request) => {
      if (request.url === NODE_ROUTES.hello) {
        const nodeKey = await signerOf(request, CHAINS.testnet.id);
        return {
          json: {
            rig: { nodeKey, operator: OPERATOR, name: 'Night Shift', pair: `0x${'0'.repeat(40)}` },
            heartbeatSeconds: 30,
            benchmark: null,
          },
        };
      }
      setImmediate(stop);
      return { json: { heartbeatSeconds: 30, jobs: [] } };
    });
    try {
      const env = environment(home, (fire) => {
        stop = fire;
      });
      const result = await run(['start', '--coordinator', coordinator.url, '--runtime-url', runtime.url], env);
      assert.equal(result.code, 0, result.err);
      assert.match(result.out, /Connected as rig "Night Shift"/);
      assert.match(result.out, /Stopped\./);

      const hello = JSON.parse(coordinator.requests[0]?.body.toString('utf8') ?? '');
      assert.deepEqual(hello.gpu, { model: 'Card A', vramMb: 8192, driver: '551.86' });
      assert.deepEqual(hello.runtime.models, ['alpha:7b']);
      assert.equal(coordinator.requests[1]?.url, NODE_ROUTES.heartbeat);

      const again = await run(['status'], environment(home));
      assert.match(again.out, new RegExp(`Coordinator: ${coordinator.url}`));
    } finally {
      await coordinator.close();
      await runtime.close();
    }
  });

  it('signs every request for chain 46630 when the node runs on testnet', async () => {
    const { home, key } = fresh('start-testnet');
    await run(['init', '--operator', OPERATOR, '--network', 'testnet'], environment(home));
    const nodeAddress = (JSON.parse(readFileSync(key, 'utf8')) as { address: string }).address;
    const runtime = await startMockServer((request) =>
      request.url === '/api/version' ? { json: { version: '0.12.3' } } : { json: { models: [{ name: 'alpha:7b' }] } },
    );
    let stop = (): void => undefined;
    const coordinator = await startMockServer(async (request) => {
      if ((await signerOf(request, 46630)) !== nodeAddress) {
        return { status: 401, json: { error: 'The signature does not match x-node-key.' } };
      }
      if (request.url === NODE_ROUTES.hello) {
        const rig = { nodeKey: nodeAddress, operator: OPERATOR, name: 'Night Shift', pair: `0x${'0'.repeat(40)}` };
        return { json: { rig, heartbeatSeconds: 30, benchmark: null } };
      }
      setImmediate(stop);
      return { json: { heartbeatSeconds: 30, jobs: [] } };
    });
    try {
      const env = environment(home, (fire) => {
        stop = fire;
      });
      const result = await run(['start', '--coordinator', coordinator.url, '--runtime-url', runtime.url], env);
      assert.equal(result.code, 0, result.err);
      assert.equal(coordinator.requests.length, 2);
      for (const request of coordinator.requests) {
        assert.equal(await signerOf(request, 46630), nodeAddress);
        assert.notEqual(await signerOf(request, CHAINS.mainnet.id), nodeAddress);
      }
    } finally {
      await coordinator.close();
      await runtime.close();
    }
  });
});

describe('the rig executable', () => {
  it('rejects a bad operator address with a usage exit code', async () => {
    const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
    const home = join(root, 'cli');
    const outcome = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = execFile(
        process.execPath,
        [cli, 'init', '--operator', '0x1234'],
        { env: { ...process.env, APPDATA: home, XDG_CONFIG_HOME: home } },
        (_error, _stdout, stderr) => resolve({ code: child.exitCode, stderr }),
      );
    });
    assert.equal(outcome.code, 64);
    assert.match(outcome.stderr, /--operator must be a wallet address/);
    assert.equal(existsSync(home), false);
  });
});

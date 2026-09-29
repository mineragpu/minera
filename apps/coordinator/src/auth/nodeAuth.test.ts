import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { NODE_HEADERS, type Address } from '@dayagpu/shared';
import { signNodeRequest } from '../testing/nodeSigner.ts';
import { NodeAuthError, verifyNodeRequest, type NodeAuthDeps, type SignedRequest } from './nodeAuth.ts';

interface TestRig {
  nodeKey: Address;
  retired: boolean;
}

const rigAccount = privateKeyToAccount(generatePrivateKey());
const strangerAccount = privateKeyToAccount(generatePrivateKey());
const NOW = new Date('2026-09-29T12:00:00Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const PATH = '/v1/node/heartbeat';
const BODY = JSON.stringify({ load: { busy: false, queue: 0 } });

function deps(rigs: TestRig[] = [{ nodeKey: rigAccount.address.toLowerCase() as Address, retired: false }]) {
  const used = new Set<string>();
  const value: NodeAuthDeps<TestRig> = {
    now: () => NOW,
    findRig: async (nodeKey) => rigs.find((rig) => rig.nodeKey === nodeKey) ?? null,
    useNonce: async (nodeKey, nonce) => {
      const key = `${nodeKey}:${nonce}`;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    },
  };
  return value;
}

async function request(overrides: Partial<SignedRequest> & { timestamp?: number } = {}): Promise<SignedRequest> {
  const headers = await signNodeRequest(rigAccount, {
    method: 'POST',
    path: PATH,
    body: BODY,
    timestamp: overrides.timestamp ?? NOW_SECONDS,
  });
  return {
    method: 'POST',
    path: PATH,
    headers,
    body: new TextEncoder().encode(BODY),
    ...overrides,
  };
}

async function rejects(promise: Promise<unknown>, statusCode: number, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof NodeAuthError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

describe('verifyNodeRequest', () => {
  it('accepts a request signed by a deployed rig', async () => {
    const rig = await verifyNodeRequest(await request(), deps());
    assert.equal(rig.nodeKey, rigAccount.address.toLowerCase());
  });

  it('accepts a bodyless request signed over the empty-body digest', async () => {
    const headers = await signNodeRequest(rigAccount, { method: 'GET', path: '/v1/node/jobs', timestamp: NOW_SECONDS });
    const rig = await verifyNodeRequest({ method: 'GET', path: '/v1/node/jobs', headers, body: null }, deps());
    assert.equal(rig.retired, false);
  });

  it('rejects a signature from a different key', async () => {
    const signed = await request();
    const forged = await signNodeRequest(strangerAccount, {
      method: 'POST',
      path: PATH,
      body: BODY,
      timestamp: NOW_SECONDS,
    });
    const headers = { ...signed.headers, [NODE_HEADERS.signature]: forged[NODE_HEADERS.signature] };
    await rejects(verifyNodeRequest({ ...signed, headers }, deps()), 401, 'bad_signature');
  });

  it('rejects a stale or future timestamp', async () => {
    await rejects(verifyNodeRequest(await request({ timestamp: NOW_SECONDS - 121 }), deps()), 401, 'stale_request');
    await rejects(verifyNodeRequest(await request({ timestamp: NOW_SECONDS + 121 }), deps()), 401, 'stale_request');
  });

  it('rejects a reused nonce', async () => {
    const shared = deps();
    const signed = await request();
    await verifyNodeRequest(signed, shared);
    await rejects(verifyNodeRequest(signed, shared), 401, 'replayed_request');
  });

  it('rejects a body that differs from the signed one', async () => {
    const tampered = new TextEncoder().encode(BODY.replace('false', 'true'));
    await rejects(verifyNodeRequest(await request({ body: tampered }), deps()), 401, 'bad_signature');
  });

  it('rejects a signed request replayed against another path', async () => {
    await rejects(verifyNodeRequest(await request({ path: '/v1/node/hello' }), deps()), 401, 'bad_signature');
  });

  it('rejects missing and malformed headers', async () => {
    const signed = await request();
    const { [NODE_HEADERS.nonce]: _omitted, ...withoutNonce } = signed.headers;
    await rejects(verifyNodeRequest({ ...signed, headers: withoutNonce }, deps()), 401, 'missing_header');
    const badKey = { ...signed.headers, [NODE_HEADERS.key]: 'rig-1' };
    await rejects(verifyNodeRequest({ ...signed, headers: badKey }, deps()), 401, 'malformed_header');
  });

  it('refuses keys that are not deployed or are retired', async () => {
    await rejects(verifyNodeRequest(await request(), deps([])), 403, 'unknown_rig');
    const retired = [{ nodeKey: rigAccount.address.toLowerCase() as Address, retired: true }];
    await rejects(verifyNodeRequest(await request(), deps(retired)), 403, 'retired_rig');
  });

  it('does not burn a nonce on a request that fails the signature check', async () => {
    const shared = deps();
    const signed = await request();
    await rejects(verifyNodeRequest({ ...signed, path: '/other' }, shared), 401, 'bad_signature');
    await verifyNodeRequest(signed, shared);
  });
});

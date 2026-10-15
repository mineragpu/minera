import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { Address, Hex } from '@minera/shared';
import { getAddress } from 'viem';
import { autopilotStep, ensureModel, initialAutopilotState, type AutopilotOptions } from './autopilot.ts';
import type { ReadyClaim, SendClaim } from './claim.ts';
import { createLogger } from './logger.ts';

const NODE: Address = getAddress('0x92f6da0c67411ac7e01a3247cd7770871a081ad2');
const OPERATOR: Address = getAddress('0x875d0145e0b56e701dbdf32c92dbedf46404c74d');
const LEAF = `0x${'ab'.repeat(32)}`;
const TX: Hex = `0x${'cd'.repeat(32)}`;

interface World {
  standing: string;
  model: string;
  claim: Record<string, unknown>;
}

function world(overrides: Partial<World> = {}): World {
  return {
    standing: 'probation',
    model: 'llama3.2:1b',
    claim: {
      cumulative: '2000000000000000',
      claimable: '2000000000000000',
      settlement: { index: 3 },
      proof: [LEAF],
    },
    ...overrides,
  };
}

/** A coordinator that answers the three public routes the autopilot reads. */
function coordinator(state: World): { fetch: typeof fetch; asked: string[] } {
  const asked: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    asked.push(path);
    const body =
      path === `/v1/rigs/${NODE}`
        ? { nodeKey: NODE, operator: OPERATOR.toLowerCase(), standing: state.standing }
        : path === '/v1/network'
          ? { jobs: { model: state.model } }
          : path === `/v1/claims/${OPERATOR}`
            ? state.claim
            : null;
    return new Response(JSON.stringify(body), { status: body === null ? 404 : 200 });
  }) as typeof fetch;
  return { fetch: fetchImpl, asked };
}

function setup(state: World, parts: { installed?: string[] | null; claimMin?: bigint; send?: SendClaim } = {}) {
  const lines: string[] = [];
  const sink = { write: (chunk: string) => lines.push(chunk) };
  const pulled: string[] = [];
  const sent: [Address, ReadyClaim][] = [];
  const { fetch: fetchImpl, asked } = coordinator(state);
  const options: AutopilotOptions = {
    coordinator: 'https://coord.example',
    nodeAddress: NODE,
    logger: createLogger({ format: 'text', quiet: false, stdout: sink, stderr: sink }),
    keepModel: {
      listModels: async () => (parts.installed === undefined ? ['llama3.2:1b'] : parts.installed),
      pull: async (model) => {
        pulled.push(model);
      },
    },
    claim: {
      minWei: parts.claimMin ?? 1_000_000_000_000_000n,
      send:
        parts.send ??
        (async (operator, claim) => {
          sent.push([operator, claim]);
          return TX;
        }),
    },
    fetch: fetchImpl,
  };
  return { options, lines, pulled, sent, asked };
}

const signal = new AbortController().signal;

describe('ensureModel', () => {
  it('leaves an installed model alone', async () => {
    const run = setup(world());
    assert.equal(await ensureModel(run.options, signal), 'llama3.2:1b');
    assert.deepEqual(run.pulled, []);
  });

  it('downloads the open-job model when the runtime lacks it', async () => {
    const run = setup(world({ model: 'qwen3:8b' }));
    assert.equal(await ensureModel(run.options, signal), 'qwen3:8b');
    assert.deepEqual(run.pulled, ['qwen3:8b']);
    assert.ok(run.lines.some((line) => line.includes('Open jobs use qwen3:8b')));
  });

  it('refuses a model name it would not accept from the runtime', async () => {
    const run = setup(world({ model: '../../etc/passwd; rm -rf' }));
    await assert.rejects(ensureModel(run.options, signal), /valid model/);
    assert.deepEqual(run.pulled, []);
  });

  it('does nothing when --keep-model is off', async () => {
    const run = setup(world({ model: 'qwen3:8b' }));
    assert.equal(await ensureModel({ ...run.options, keepModel: null }, signal), null);
    assert.deepEqual(run.asked, []);
  });
});

describe('autopilotStep', () => {
  it('reports the standing, then only its changes', async () => {
    const state = world();
    const run = setup(state);
    let memory = await autopilotStep({ ...run.options, claim: null }, initialAutopilotState(), signal);
    assert.equal(memory.standing, 'probation');
    assert.ok(run.lines.some((line) => line.includes('Sentinel standing: probation.')));
    state.standing = 'quarantined';
    memory = await autopilotStep({ ...run.options, claim: null }, memory, signal);
    assert.ok(run.lines.some((line) => line.includes('from probation to quarantined. It gets no work')));
    assert.equal(memory.standing, 'quarantined');
  });

  it('claims for the operator once the threshold is reached, and only once', async () => {
    const run = setup(world());
    let memory = await autopilotStep(run.options, initialAutopilotState(), signal);
    assert.equal(run.sent.length, 1);
    assert.deepEqual(run.sent[0], [OPERATOR, { index: 3, cumulative: 2_000_000_000_000_000n, claimable: 2_000_000_000_000_000n, proof: [LEAF] }]);
    assert.ok(run.lines.some((line) => line.includes(`Claimed 0.002 ETH for ${OPERATOR}. Transaction ${TX}.`)));
    memory = await autopilotStep(run.options, memory, signal);
    assert.equal(run.sent.length, 1);
  });

  it('waits while the claimable amount is below the threshold', async () => {
    const run = setup(world(), { claimMin: 5_000_000_000_000_000n });
    await autopilotStep(run.options, initialAutopilotState(), signal);
    assert.equal(run.sent.length, 0);
  });

  it('waits while no settlement is claimable', async () => {
    const run = setup(world({ claim: { cumulative: '0', claimable: '0', settlement: null, proof: [] } }));
    await autopilotStep(run.options, initialAutopilotState(), signal);
    assert.equal(run.sent.length, 0);
  });

  it('reports a failed claim once while it keeps failing, and tries again', async () => {
    let attempts = 0;
    const run = setup(world(), {
      send: async () => {
        attempts += 1;
        throw new Error('nonce too low');
      },
    });
    let memory = await autopilotStep(run.options, initialAutopilotState(), signal);
    memory = await autopilotStep(run.options, memory, signal);
    assert.equal(attempts, 2);
    assert.equal(run.lines.filter((line) => line.includes('The claim was not sent: nonce too low')).length, 1);
    assert.equal(memory.claimed, null);
  });

  it('never sends a claim built from a malformed answer', async () => {
    const run = setup(world({ claim: { cumulative: '1', claimable: '2', settlement: { index: 3 }, proof: [LEAF] } }));
    await autopilotStep(run.options, initialAutopilotState(), signal);
    assert.equal(run.sent.length, 0);
    assert.ok(run.lines.some((line) => line.includes('Autopilot check failed: The claimable amount exceeds the cumulative amount.')));
  });

  it('keeps going when the coordinator cannot be reached', async () => {
    const run = setup(world());
    const failing = { ...run.options, fetch: (async () => { throw new Error('connect ECONNREFUSED'); }) as typeof fetch };
    const memory = await autopilotStep(failing, initialAutopilotState(), signal);
    assert.equal(memory.warned, 'Autopilot check failed: connect ECONNREFUSED');
  });
});

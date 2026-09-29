import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { JobRecord } from '../store/records.ts';
import { seededRandom } from '../testing/seededRandom.ts';
import { knownAnswerPrompt, passesKnownAnswer } from './knownAnswer.ts';
import { estimateTokens, measureUnits } from './units.ts';
import { judge, outputsMatch } from './verify.ts';

function job(overrides: Partial<JobRecord>): JobRecord {
  return {
    id: 'a',
    groupId: 'a',
    kind: 'chat',
    model: 'small-model',
    messages: [{ role: 'user', content: 'What is 37 plus 58?' }],
    params: { temperature: 0, seed: 1, maxTokens: 64 },
    expected: null,
    targetNode: null,
    status: 'assigned',
    assignedNode: null,
    assignedAt: null,
    deadlineAt: null,
    attempts: 1,
    output: null,
    outputHash: null,
    units: null,
    verification: 'pending',
    createdAt: new Date(0),
    expiresAt: new Date(0),
    finishedAt: null,
    verifiedAt: null,
    ...overrides,
  };
}

describe('outputsMatch', () => {
  it('ignores surrounding and repeated whitespace', () => {
    assert.ok(outputsMatch('  The sky is\n\nblue.  ', 'The sky is blue.'));
    assert.ok(outputsMatch('a\tb', 'a b'));
  });

  it('treats any other difference as a mismatch', () => {
    assert.ok(!outputsMatch('The sky is blue.', 'The sky is Blue.'));
    assert.ok(!outputsMatch('42', '43'));
  });
});

describe('passesKnownAnswer', () => {
  const question = 'What is 37 plus 58?';

  it('accepts the answer alone, restated with the question, or as a decimal', () => {
    for (const output of ['95', '37 + 58 = 95', 'The answer is 95.', '95.0']) {
      assert.ok(passesKnownAnswer(output, '95', question), output);
    }
  });

  it('rejects a wrong, missing, hedged or echoed answer', () => {
    for (const output of ['96', '', 'I cannot do that', '95 or 96', 'You asked about 37 and 58']) {
      assert.ok(!passesKnownAnswer(output, '95', question), output);
    }
  });
});

describe('knownAnswerPrompt', () => {
  it('always asks a question whose answer is not one of its operands', () => {
    const random = seededRandom(7);
    for (let round = 0; round < 500; round += 1) {
      const prompt = knownAnswerPrompt(random);
      const text = prompt.messages.map((message) => message.content).join(' ');
      const numbers: string[] = text.match(/\d+/g) ?? [];
      assert.ok(!numbers.includes(prompt.expected), text);
      assert.ok(passesKnownAnswer(prompt.expected, prompt.expected, text));
    }
  });
});

describe('judge', () => {
  it('passes a challenge that gives the known answer and fails one that does not', () => {
    const challenge = job({ kind: 'challenge', expected: '95' });
    assert.deepEqual(judge(challenge, '95', [challenge]), { type: 'check', passed: true });
    assert.deepEqual(judge(challenge, '94', [challenge]), { type: 'check', passed: false });
    assert.deepEqual(judge(job({ kind: 'benchmark', expected: null }), '95', []), { type: 'check', passed: false });
  });

  it('matches twins on normalized output and flags a disagreement', () => {
    const mine = job({ id: 'a' });
    const twin = job({ id: 'b', status: 'done', output: 'The  sky is blue.\n' });
    assert.deepEqual(judge(mine, 'The sky is blue.', [mine, twin]), { type: 'twin', match: true, twin });
    assert.deepEqual(judge(mine, 'The sky is green.', [mine, twin]), { type: 'twin', match: false, twin });
  });

  it('waits for a twin still in flight and leaves a lone job unchecked', () => {
    const mine = job({ id: 'a' });
    assert.deepEqual(judge(mine, 'x', [mine, job({ id: 'b', status: 'queued' })]), { type: 'await-twin' });
    assert.deepEqual(judge(mine, 'x', [mine, job({ id: 'b', status: 'assigned' })]), { type: 'await-twin' });
    assert.deepEqual(judge(mine, 'x', [mine]), { type: 'unchecked' });
    assert.deepEqual(judge(mine, 'x', [mine, job({ id: 'b', status: 'expired' })]), { type: 'unchecked' });
  });
});

describe('measureUnits', () => {
  it('estimates one token per four characters, rounded up', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('abcde'), 2);
    assert.equal(estimateTokens('日本語の'), 1);
  });

  it('measures the normalized output and caps it at the job budget', () => {
    assert.equal(measureUnits('  abcd   efgh  ', 64), 3);
    assert.equal(measureUnits('x'.repeat(10_000), 256), 256);
  });
});

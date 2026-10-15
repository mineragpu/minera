/**
 * The one sentence the network writes for a report. Brain asks it as a verified prompt, so two
 * unrelated rigs answer it, and keeps the sentence only when the two agreed and it passes the guard:
 * no figures, no links and nothing that reads as a price call or a promise.
 */

import type { MineraApi } from '@minera-gpu/mcp/api';
import { makeAskTool, type AskOptions } from '@minera-gpu/mcp/tools';
import type { Facts } from './facts.ts';

export type Thought =
  | { kind: 'kept'; text: string; jobId: string }
  | { kind: 'skipped'; reason: string; jobId?: string };

const BANNED = [
  'price', 'profit', 'return', 'yield', 'apy', 'moon', 'pump', 'buy', 'sell', 'guarantee', 'financial',
  'invest', 'gains', 'revolutionary', 'game-changing', 'cutting-edge', 'the future of', 'seamless', 'unlock',
  'empower', 'disrupt',
];

/** Why a sentence may not go into a report, or null when it may. */
export function guardThought(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0) return 'empty';
  if (text.length > 200) return 'too long';
  if (/\n/.test(text)) return 'more than one line';
  if (/\d/.test(text)) return 'contains a figure';
  if (/https?:|www\.|\.tech\b|\.com\b/i.test(text)) return 'contains a link';
  if (/[!\u2014\u2013#@$]/.test(text)) return 'contains !, a dash, a hashtag, a mention or a $';
  const lower = text.toLowerCase();
  const word = BANNED.find((banned) => lower.includes(banned));
  return word ? `contains "${word}"` : null;
}

/** The prompt: today's figures as plain facts, and a narrow request for one calm sentence. */
export function thoughtPrompt(facts: Facts): string {
  return [
    'These are today\'s figures for Minera, a network where GPUs answer prompts and are paid only for verified work:',
    `- ${facts.rigsOnline} of ${facts.rigsTotal} rigs online`,
    `- ${facts.verifiedUnits24h} units of verified work in the last 24 hours`,
    `- ${facts.campaignBurns} burn(s) into the pool in the current campaign`,
    'Write one short, calm sentence, at most 25 words, that the network itself might say about this day.',
    'Use no numbers, no prices, no predictions, no hashtags, no emojis and no exclamation marks.',
  ].join('\n');
}

export async function askThought(api: MineraApi, facts: Facts, options: AskOptions = {}): Promise<Thought> {
  if (facts.rigsOnline === 0) return { kind: 'skipped', reason: 'no rigs online, so nothing was asked' };
  const view = (await makeAskTool(options).read(api, { prompt: thoughtPrompt(facts) })) as Record<string, unknown>;
  const jobId = typeof view['id'] === 'string' ? view['id'] : '';
  const skipped = (reason: string): Thought => (jobId ? { kind: 'skipped', reason, jobId } : { kind: 'skipped', reason });
  if (view['verification'] !== 'verified') {
    return skipped(`the answer was ${String(view['verification'] ?? 'not settled')}, not verified`);
  }
  const text = String(view['output'] ?? '').trim().replace(/^["'“]+|["'”]+$/g, '');
  const problem = guardThought(text);
  if (problem) return skipped(`the verified answer ${problem}`);
  return { kind: 'kept', text, jobId };
}

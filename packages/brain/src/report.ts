/**
 * A report draft: the figures, the posts built from them, and the network's sentence when one was
 * kept. Brain only drafts. A person reads the draft and decides whether to post it.
 */

import type { MineraApi } from '@minera-gpu/mcp/api';
import type { AskOptions } from '@minera-gpu/mcp/tools';
import { gatherFacts, formatCount, formatEth, type Facts } from './facts.ts';
import { askThought, type Thought } from './thought.ts';

export interface Posts {
  x: string;
  telegram: string;
}

export interface Report {
  facts: Facts;
  thought: Thought;
  posts: Posts;
  markdown: string;
}

const SITE = 'mineragpu.tech';

/** Length as X counts it: a link or a bare mineragpu.tech address counts as 23 characters. */
export function xLength(text: string): number {
  return [...text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).replace(/\bmineragpu\.tech(\/\S*)?/g, 'x'.repeat(23))].length;
}

function day(now: Date): string {
  return now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function draftPosts(facts: Facts, thought: Thought, now: Date): Posts {
  const rigs = `${formatCount(facts.rigsOnline)} of ${formatCount(facts.rigsTotal)} rigs online`;
  const work = `${formatCount(facts.verifiedUnits24h)} units of verified work in the last 24 hours`;
  const burned = `${formatEth(facts.poolBurned)} ETH burned into the Burn Pool so far`;
  const sentence = thought.kind === 'kept' ? `"${thought.text}"\nWritten by the network, checked by two rigs.\n\n` : '';
  const base = `Minera, ${day(now)}.\n\n${rigs}. ${work}. ${burned}.\n\n`;
  const withSentence = `${base}${sentence}${SITE}`;
  const x = xLength(withSentence) <= 280 ? withSentence : `${base}${SITE}`;

  const lines = [
    `Minera Brain report, ${day(now)}`,
    '',
    `Rigs online: ${formatCount(facts.rigsOnline)} of ${formatCount(facts.rigsTotal)}`,
    `Verified work, last 24 hours: ${formatCount(facts.verifiedUnits24h)} units`,
    `Answers, last 24 hours: ${formatCount(facts.answers24h)}`,
    `Burned into the Burn Pool: ${formatEth(facts.poolBurned)} ETH (${formatEth(facts.poolCommitted)} committed to settlements)`,
    `Epoch: ${facts.epoch}`,
    ...(facts.topRigs.length > 0 ? [`Most verified work this epoch: ${facts.topRigs.join(', ')}`] : []),
    ...(thought.kind === 'kept' ? ['', `"${thought.text}"`, 'Written by the network, checked by two rigs.'] : []),
    '',
    SITE,
  ];
  return { x, telegram: lines.join('\n') };
}

/** Why a figures post would be better left for another day, or null when it is worth posting. */
export function holdReason(facts: Facts): string | null {
  if (facts.rigsOnline === 0 && facts.verifiedUnits24h === '0') {
    return 'no rig is online and no work was verified in the last 24 hours, so this post would show an idle network.';
  }
  return null;
}

export interface ReportOptions {
  api: MineraApi;
  /** Ask the network for its sentence. It creates a job, so it is off unless asked for. */
  ask: boolean;
  askOptions?: AskOptions;
  now?: Date;
}

export async function buildReport({ api, ask, askOptions, now = new Date() }: ReportOptions): Promise<Report> {
  const facts = await gatherFacts(api);
  const thought: Thought = ask
    ? await askThought(api, facts, askOptions)
    : { kind: 'skipped', reason: 'not asked (run with --ask to ask the network)' };
  const posts = draftPosts(facts, thought, now);
  const sentence =
    thought.kind === 'kept'
      ? `Kept: "${thought.text}"\n\nVerified by two unrelated rigs, job \`${thought.jobId}\`.`
      : `None this time: ${thought.reason}.${thought.jobId ? ` Job \`${thought.jobId}\`.` : ''}`;
  const hold = holdReason(facts);
  const markdown = [
    `# Minera Brain draft, ${now.toISOString().slice(0, 10)} (${facts.network})`,
    '',
    `A draft for a person to approve before anything is posted. Figures read from ${api.baseUrl}; the pool as of ${facts.asOf || 'unknown'}.`,
    '',
    ...(hold ? [`**Hold:** ${hold}`, ''] : []),
    `## X (${xLength(posts.x)} of 280 characters)`,
    '',
    posts.x,
    '',
    '## Telegram',
    '',
    posts.telegram,
    '',
    "## The network's sentence",
    '',
    sentence,
    '',
    '## Figures',
    '',
    '| Figure | Value |',
    '|---|---|',
    `| Network | ${facts.network} (chain ID ${facts.chainId}) |`,
    `| Rigs online / total | ${facts.rigsOnline} / ${facts.rigsTotal} |`,
    `| Verified units, last 24 hours | ${facts.verifiedUnits24h} |`,
    `| Answers, last 24 hours | ${facts.answers24h} |`,
    `| Burned into the pool, wei | ${facts.poolBurned} |`,
    `| Committed to settlements, wei | ${facts.poolCommitted} |`,
    `| Burns in the current campaign | ${facts.campaignBurns} |`,
    `| Epoch | ${facts.epoch} |`,
    '',
  ].join('\n');
  return { facts, thought, posts, markdown };
}

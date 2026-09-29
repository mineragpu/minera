/**
 * The copy rules the docs must follow (RULES.md §6), checked on the prose: code is left out,
 * since commands and JSON legitimately contain exclamation marks.
 */

const BANNED = [
  'revolutionary',
  'game-changing',
  'cutting-edge',
  'the future of',
  'seamless',
  'seamlessly',
  'leverage',
  'leverages',
  'leveraging',
  'empower',
  'empowers',
  'disrupt',
  'disrupts',
];

function prose(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
}

export function copyProblems(markdown: string): string[] {
  const text = prose(markdown);
  const problems: string[] = [];
  for (const word of BANNED) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) problems.push(`uses the banned word "${word}"`);
  }
  if (/!(?=\s|$)/m.test(text)) problems.push('uses an exclamation mark');
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push('uses an emoji');
  return problems;
}

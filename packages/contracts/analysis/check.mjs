#!/usr/bin/env node
// Compares a static analyzer's findings with the reviewed list in triage.json and prints a Markdown
// summary. Every Slither finding of medium impact or higher and every Aderyn finding of high
// severity must be fixed or listed there with the reason it is not a bug; anything else fails.
//
//   node check.mjs slither <slither.json>
//   node check.mjs aderyn <aderyn.json>

import { readFileSync } from 'node:fs';

const [tool, file] = process.argv.slice(2);
if ((tool !== 'slither' && tool !== 'aderyn') || !file) {
  console.error('Usage: node check.mjs slither|aderyn <report.json>');
  process.exit(64);
}

const triage = JSON.parse(readFileSync(new URL('./triage.json', import.meta.url), 'utf8'));
const reviewed = new Map(triage.filter((entry) => entry.tool === tool).map((entry) => [entry.key, entry]));
const report = JSON.parse(readFileSync(file, 'utf8'));

function slitherFindings() {
  if (report.success === false) throw new Error(`Slither failed: ${report.error}`);
  return (report.results?.detectors ?? []).map((finding) => {
    const fn = finding.elements.find((element) => element.type === 'function');
    const place = fn
      ? `${fn.type_specific_fields.parent.name}.${fn.type_specific_fields.signature}`
      : finding.first_markdown_element;
    return {
      key: `${finding.check}:${place}`,
      severity: finding.impact,
      blocking: finding.impact === 'High' || finding.impact === 'Medium',
      where: finding.first_markdown_element,
    };
  });
}

function aderynFindings() {
  const findings = [];
  for (const [severity, group] of [['High', report.high_issues], ['Low', report.low_issues]]) {
    for (const issue of group?.issues ?? []) {
      for (const instance of issue.instances) {
        findings.push({
          key: `${issue.detector_name}:${instance.contract_path}:${instance.line_no}`,
          severity,
          blocking: severity === 'High',
          where: `${instance.contract_path}#L${instance.line_no}`,
        });
      }
    }
  }
  return findings;
}

const findings = tool === 'slither' ? slitherFindings() : aderynFindings();
const open = findings.filter((finding) => finding.blocking && !reviewed.has(finding.key));
const seen = new Set(findings.map((finding) => finding.key));
const stale = [...reviewed.keys()].filter((key) => !seen.has(key));

const name = tool === 'slither' ? 'Slither' : 'Aderyn';
const lines = [`## ${name}`, '', `${findings.length} finding(s); ${open.length} open.`, ''];
if (findings.length > 0) {
  lines.push('| Severity | Finding | Where | Status |', '|---|---|---|---|');
  for (const finding of findings) {
    const entry = reviewed.get(finding.key);
    const status = entry ? `${entry.verdict}: ${entry.reason}` : finding.blocking ? '**Open**' : 'Below the bar';
    lines.push(`| ${finding.severity} | \`${finding.key}\` | ${finding.where} | ${status.replaceAll('|', '\\|')} |`);
  }
  lines.push('');
}
if (stale.length > 0) lines.push(`Reviewed entries no longer reported: ${stale.map((key) => `\`${key}\``).join(', ')}.`, '');
console.log(lines.join('\n'));
process.exit(open.length > 0 ? 1 : 0);

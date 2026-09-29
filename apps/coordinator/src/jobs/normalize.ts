/** The form outputs are compared and measured in: trimmed, each run of whitespace one space. */
export function normalizeOutput(output: string): string {
  return output.trim().replace(/\s+/g, ' ');
}

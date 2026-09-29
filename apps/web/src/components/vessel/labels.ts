/**
 * Vertical centers for a column of labels, top to bottom, as close to `wanted` as possible while
 * label i and label i + 1 stay at least `gaps[i]` apart, and no label sits below `floor`.
 *
 * Shifting each label up by the gaps above it turns the spacing rule into plain ordering, which
 * pooling adjacent violators solves with the least total displacement.
 */
export function spreadLabels(wanted: readonly number[], gaps: readonly number[], floor: number): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let i = 0; i < wanted.length; i++) {
    offsets.push(offset);
    offset += gaps[i] ?? 0;
  }

  const blocks: { mean: number; size: number }[] = [];
  wanted.forEach((y, i) => {
    let block = { mean: y - (offsets[i] ?? 0), size: 1 };
    for (let last = blocks.at(-1); last && last.mean > block.mean; last = blocks.at(-1)) {
      blocks.pop();
      const size = last.size + block.size;
      block = { mean: (last.mean * last.size + block.mean * block.size) / size, size };
    }
    blocks.push(block);
  });

  const placed = blocks.flatMap((block) => Array.from({ length: block.size }, () => block.mean));
  const centers = placed.map((y, i) => y + (offsets[i] ?? 0));
  for (let i = centers.length - 1, limit = floor; i >= 0; i--) {
    const center = Math.min(centers[i] ?? limit, limit);
    centers[i] = center;
    limit = center - (gaps[i - 1] ?? 0);
  }
  return centers;
}

interface Mote {
  /** Start, in drawing units, above the vessel's mouth. */
  x: number;
  y: number;
  size: number;
  /** Seconds into the loop it starts at, and how long one fall takes. */
  lag: number;
  time: number;
}

/** Deposits arriving: specks that fall into the mouth, drifting in toward the deposit line. */
const MOTES: readonly Mote[] = [
  { x: -6, y: -306, size: 2.4, lag: 0, time: 2.8 },
  { x: 8, y: -300, size: 2, lag: 0.9, time: 3.1 },
  { x: -16, y: -302, size: 2.8, lag: 1.8, time: 2.6 },
  { x: 4, y: -308, size: 1.7, lag: 0.45, time: 3.3 },
  { x: -20, y: -298, size: 2.2, lag: 1.35, time: 2.9 },
  { x: 14, y: -304, size: 1.9, lag: 2.25, time: 3.4 },
  { x: -10, y: -310, size: 2.5, lag: 2.7, time: 2.7 },
  { x: 2, y: -296, size: 1.6, lag: 3.1, time: 3 },
];

/** The mouth of the vessel, where each mote fades out. */
const MOUTH_Y = -182;

export function Motes() {
  return (
    <g className="motes">
      {MOTES.map(({ x, y, size, lag, time }) => (
        <polygon
          key={`${x},${y}`}
          className="mote"
          points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
          fill="url(#vs-iri)"
          style={{ '--dx': `${(-x * 0.8).toFixed(1)}px`, '--dy': `${MOUTH_Y - y}px`, '--lag': `${-lag}s`, '--time': `${time}s` }}
        />
      ))}
    </g>
  );
}

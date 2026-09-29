import { formatNumber } from '../../lib/format.ts';
import { at, points, project, segment, type Point3 } from './isometric.ts';
import './vessel.css';

/** Vessel width and depth, in drawing units. */
const W = 150;
/** Vessel height, in drawing units. */
const H = 242;
/** Drawing units per ETH: one slab. */
const SLAB = 13;
/** Gap between the slabs and the glass. */
const INSET = 9;
/** The scale runs to this many ETH. */
const SCALE_MAX = 18;

const X0 = INSET;
const X1 = W - INSET;
const Z0 = INSET;
const Z1 = W - INSET;

const SLAB_EDGES = ['var(--teal)', 'var(--blue)', 'var(--violet)', 'var(--magenta)', 'var(--gold)'];

function level(eth: number): number {
  return 2 + eth * SLAB;
}

function floorGrid(): string {
  let path = '';
  for (let v = 25; v < W; v += 25) path += segment([v, 0, 0], [v, 0, W]) + segment([0, 0, v], [W, 0, v]);
  return path;
}

function scale(): { path: string; labels: { eth: number; x: string; y: string }[] } {
  let path = segment([W, level(0), -4], [W, level(SCALE_MAX), -4]);
  const labels: { eth: number; x: string; y: string }[] = [];
  for (let eth = 0; eth <= SCALE_MAX; eth++) {
    const major = eth % 4 === 0;
    path += segment([W, level(eth), -4], [W, level(eth), major ? -14 : -9]);
    if (major) labels.push({ eth, ...at([W, level(eth), -22]) });
  }
  return { path, labels };
}

interface Slab {
  index: number;
  bottom: number;
  top: number;
}

/** One slab per whole ETH, plus a thinner one for the remainder. */
function slabs(balance: number): Slab[] {
  const whole = Math.floor(balance);
  const remainder = balance - whole;
  const count = whole + (remainder > 0.001 ? 1 : 0);
  return Array.from({ length: count }, (_, index) => {
    const bottom = level(index);
    const thickness = (index < whole ? SLAB : remainder * SLAB) - 2.5;
    return { index, bottom, top: bottom + thickness };
  });
}

function box(y: number): Point3[] {
  return [
    [X0, y, Z0],
    [X1, y, Z0],
    [X1, y, Z1],
    [X0, y, Z1],
  ];
}

function Drop({ x, y, phase, fall }: { x: number; y: number; phase: number; fall: number }) {
  return (
    <g className="drop" style={{ '--k': phase, '--dy': `${fall}px` }}>
      <polygon points={`${x},${y - 4} ${x + 4},${y} ${x},${y + 4} ${x - 4},${y}`} fill="url(#vs-iri)" />
    </g>
  );
}

const FLOOR_GRID = floorGrid();
const SCALE = scale();
const EDGES =
  segment([W, 0, 0], [W, H, 0]) +
  segment([0, 0, W], [0, H, W]) +
  segment([W, 0, W], [W, H, W]) +
  segment([W, 0, 0], [W, 0, W]) +
  segment([W, 0, W], [0, 0, W]);

interface VesselProps {
  balanceEth: number;
  paidEth: number;
  depositedEth: number;
}

/**
 * The Burn Pool drawn to scale: filled slabs are ETH still in the pool, the hatched band above
 * them is what was paid to miners, and the dashed line marks all deposits.
 */
export function Vessel({ balanceEth, paidEth, depositedEth }: VesselProps) {
  const filled = slabs(balanceEth);
  const surface = filled[filled.length - 1]?.top ?? level(0);
  const low = level(balanceEth);
  const high = level(depositedEth);
  const marker = (y: number, dz: number) => at([0, y, W + dz]);
  const balanceMark = [marker(low, 4), marker(low, 16)] as const;
  const depositMark = [marker(high, 4), marker(high, 16)] as const;
  const bracket = [marker(low, 11), marker(high, 11)] as const;
  const balance = formatNumber(balanceEth, 2);
  const deposited = formatNumber(depositedEth, 2);
  const paid = formatNumber(paidEth, 2);

  return (
    <svg viewBox="-228 -305 430 515" role="img" aria-labelledby="vessel-title" focusable="false">
      <title id="vessel-title">
        {`Burn Pool vessel. Filled slabs show ${balance} ETH still in the pool. The hatched band above shows the ${paid} ETH paid to miners. The dashed line marks all deposits, ${deposited} ETH. One slab is 1 ETH.`}
      </title>
      <defs>
        <linearGradient id="vs-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C3CCD8" />
          <stop offset="1" stopColor="#7A8494" />
        </linearGradient>
        <linearGradient id="vs-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#586172" />
          <stop offset="1" stopColor="#3C4452" />
        </linearGradient>
        <linearGradient id="vs-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#333A47" />
          <stop offset="1" stopColor="#242A34" />
        </linearGradient>
        <linearGradient id="vs-iri" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2EE6C8" />
          <stop offset=".3" stopColor="#5A8DFF" />
          <stop offset=".55" stopColor="#8C6BFF" />
          <stop offset=".8" stopColor="#FF4FA3" />
          <stop offset="1" stopColor="#F5C451" />
        </linearGradient>
        <linearGradient id="vs-edge" gradientUnits="userSpaceOnUse" x1="0" y1="-250" x2="0" y2="160">
          <stop offset="0" stopColor="#2EE6C8" />
          <stop offset=".3" stopColor="#5A8DFF" />
          <stop offset=".55" stopColor="#8C6BFF" />
          <stop offset=".8" stopColor="#FF4FA3" />
          <stop offset="1" stopColor="#F5C451" />
        </linearGradient>
        <linearGradient id="vs-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#C9D1DC" stopOpacity=".07" />
          <stop offset="1" stopColor="#C9D1DC" stopOpacity=".02" />
        </linearGradient>
        <linearGradient id="vs-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".42" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id="vs-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V6" stroke="#95A0B2" strokeWidth="1.1" strokeOpacity=".55" />
        </pattern>
        <clipPath id="vs-topclip">
          <polygon points={points(box(surface))} />
        </clipPath>
      </defs>

      <polygon points={points([[0, 0, 0], [0, 0, W], [0, H, W], [0, H, 0]])} fill="#C9D1DC" fillOpacity=".025" />
      <polygon points={points([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]])} fill="#C9D1DC" fillOpacity=".035" />
      <polygon points={points([[0, 0, 0], [W, 0, 0], [W, 0, W], [0, 0, W]])} fill="#C9D1DC" fillOpacity=".06" />
      <path d={FLOOR_GRID} stroke="#8C98AA" strokeOpacity=".16" fill="none" />
      <path d={segment([0, 0, 0], [0, H, 0])} stroke="#C9D1DC" strokeOpacity=".22" strokeDasharray="3 5" fill="none" />

      {filled.map(({ index, bottom, top }) => (
        <g key={index} className="slab" style={{ '--i': index }}>
          <polygon
            points={points([[X0, bottom, Z1], [X1, bottom, Z1], [X1, top, Z1], [X0, top, Z1]])}
            fill="url(#vs-left)"
          />
          <polygon
            points={points([[X1, bottom, Z0], [X1, bottom, Z1], [X1, top, Z1], [X1, top, Z0]])}
            fill="url(#vs-right)"
          />
          <polygon points={points(box(top))} fill="url(#vs-top)" />
          {index === filled.length - 1 && <polygon points={points(box(top))} fill="url(#vs-iri)" fillOpacity=".42" />}
          <polyline
            points={points([[X0, top, Z1], [X1, top, Z1], [X1, top, Z0]])}
            fill="none"
            style={{ stroke: SLAB_EDGES[index % SLAB_EDGES.length] }}
            strokeWidth="1.3"
            strokeOpacity=".9"
            strokeLinejoin="round"
          />
        </g>
      ))}

      <g clipPath="url(#vs-topclip)">
        <g className="sheen">
          <rect
            x="-300"
            y={(project([X0, surface, Z0])[1] - 10).toFixed(1)}
            width="46"
            height="160"
            fill="url(#vs-sheen)"
            transform="skewX(-30)"
          />
        </g>
      </g>

      <g className="ghost">
        <polygon points={points([[X0, low, Z1], [X1, low, Z1], [X1, high, Z1], [X0, high, Z1]])} fill="url(#vs-hatch)" />
        <polygon
          points={points([[X1, low, Z0], [X1, low, Z1], [X1, high, Z1], [X1, high, Z0]])}
          fill="url(#vs-hatch)"
          opacity=".7"
        />
        <polygon points={points(box(high))} fill="none" stroke="#C9D1DC" strokeOpacity=".75" strokeDasharray="4 4" />
        <path
          d={segment([X1, low, Z0], [X1, high, Z0]) + segment([X1, low, Z1], [X1, high, Z1]) + segment([X0, low, Z1], [X0, high, Z1])}
          stroke="#C9D1DC"
          strokeOpacity=".5"
          strokeDasharray="3 4"
          fill="none"
        />
      </g>

      <polygon points={points([[0, 0, W], [W, 0, W], [W, H, W], [0, H, W]])} fill="url(#vs-glass)" />
      <polygon points={points([[W, 0, 0], [W, 0, W], [W, H, W], [W, H, 0]])} fill="url(#vs-glass)" opacity=".7" />
      <polygon points={points([[16, 0, W], [30, 0, W], [30, H, W], [16, H, W]])} fill="#fff" fillOpacity=".05" />
      <path d={EDGES} stroke="url(#vs-edge)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <polygon
        points={points([[0, H, 0], [W, H, 0], [W, H, W], [0, H, W]])}
        fill="#C9D1DC"
        fillOpacity=".03"
        stroke="url(#vs-edge)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      <path d={SCALE.path} stroke="#8C98AA" strokeOpacity=".7" fill="none" />
      <g fill="#8C98AA" fontSize="12" dominantBaseline="middle">
        {SCALE.labels.map(({ eth, x, y }) => (
          <text key={eth} x={x} y={y}>
            {eth === 16 ? `${eth} ETH` : eth}
          </text>
        ))}
      </g>

      <path d={`M${balanceMark[0].x} ${balanceMark[0].y}L${balanceMark[1].x} ${balanceMark[1].y}`} style={{ stroke: 'var(--teal)' }} strokeWidth="1.6" />
      <path d={`M${depositMark[0].x} ${depositMark[0].y}L${depositMark[1].x} ${depositMark[1].y}`} stroke="#C9D1DC" strokeDasharray="3 3" />
      <path d={`M${bracket[0].x} ${bracket[0].y}L${bracket[1].x} ${bracket[1].y}`} stroke="#95A0B2" strokeOpacity=".7" />
      <g fontSize="12" textAnchor="end" dominantBaseline="middle">
        <text {...marker(low, 22)} style={{ fill: 'var(--teal)' }}>
          {balance}
        </text>
        <text {...marker(high, 22)} fill="#C9D1DC">
          {deposited}
        </text>
        <text {...marker((low + high) / 2, 22)} fill="#8C98AA">
          {paid} paid
        </text>
      </g>

      <path d="M0 -292V-186" stroke="#C9D1DC" strokeOpacity=".18" strokeDasharray="2 5" />
      <Drop x={0} y={-290} phase={0} fall={104} />
      <Drop x={0} y={-290} phase={1} fall={104} />
      <Drop x={0} y={-290} phase={2} fall={104} />
      <path d="M0 152V204" stroke="url(#vs-edge)" strokeOpacity=".7" strokeDasharray="2 4" />
      <Drop x={0} y={156} phase={0.5} fall={46} />
      <Drop x={0} y={156} phase={1.5} fall={46} />
      <Drop x={0} y={156} phase={2.5} fall={46} />
      <g fill="#8C98AA" fontSize="12" dominantBaseline="middle">
        <text x="12" y="-290">
          deposits in
        </text>
        <text x="12" y="198">
          rewards out
        </text>
      </g>
    </svg>
  );
}

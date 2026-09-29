const DEG = Math.PI / 180;
const CENTER = 300;

function point(radius: number, angle: number): string {
  const x = CENTER + radius * Math.cos(angle * DEG);
  const y = CENTER + radius * Math.sin(angle * DEG);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function tickPath(): string {
  let path = '';
  for (let angle = 0; angle < 360; angle += 5) {
    const inner = angle % 45 === 0 ? 266 : angle % 15 === 0 ? 277 : 284;
    path += `M${point(292, angle)}L${point(inner, angle)}`;
  }
  return path;
}

function gridPath(): string {
  let path = '';
  for (let v = 50; v < 600; v += 50) path += `M${v} 0V600M0 ${v}H600`;
  return path;
}

const TICKS = tickPath();
const GRID = gridPath();
const LABELS = [0, 90, 180, 270].map((angle) => {
  const radians = (angle - 90) * DEG;
  return {
    angle,
    x: (CENTER + 248 * Math.cos(radians)).toFixed(1),
    y: (CENTER + 248 * Math.sin(radians)).toFixed(1),
  };
});

/** The graduated ring the cluster stands on. */
export function DegreePlate() {
  return (
    <div className="plate">
      <svg viewBox="0 0 600 600" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="pl-shadow">
            <stop offset="0" stopColor="#04060A" stopOpacity=".9" />
            <stop offset=".55" stopColor="#04060A" stopOpacity=".45" />
            <stop offset="1" stopColor="#04060A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pl-iri" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2EE6C8" />
            <stop offset=".3" stopColor="#5A8DFF" />
            <stop offset=".5" stopColor="#8C6BFF" />
            <stop offset=".72" stopColor="#FF4FA3" />
            <stop offset="1" stopColor="#F5C451" />
          </linearGradient>
          <clipPath id="pl-clip">
            <circle cx="300" cy="300" r="262" />
          </clipPath>
        </defs>
        <path d={GRID} clipPath="url(#pl-clip)" stroke="#8C98AA" strokeOpacity=".17" fill="none" />
        <circle cx="300" cy="300" r="222" fill="url(#pl-shadow)" />
        <circle cx="300" cy="300" r="292" fill="none" stroke="url(#pl-iri)" strokeWidth="2.2" opacity=".9" />
        <circle cx="300" cy="300" r="262" fill="none" stroke="#8C98AA" strokeOpacity=".32" strokeDasharray="2 6" />
        <path d={TICKS} stroke="#C9D1DC" strokeOpacity=".55" strokeWidth="1.3" fill="none" />
        <g fill="#C9D1DC" fillOpacity=".8" fontSize="16" textAnchor="middle" dominantBaseline="middle">
          {LABELS.map(({ angle, x, y }) => (
            <text key={angle} x={x} y={y}>
              {angle}°
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

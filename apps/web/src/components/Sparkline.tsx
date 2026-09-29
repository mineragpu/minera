import './sparkline.css';

const WIDTH = 120;
const HEIGHT = 30;
const PAD = 3;
/** The vertical scale runs from 50 % to 100 % uptime, so small dips stay visible. */
const LOW = 50;
const HIGH = 100;

interface SparklineProps {
  /** Hourly uptime, oldest first, in percent. */
  values: readonly number[];
}

export function Sparkline({ values }: SparklineProps) {
  const count = values.length;
  const x = (index: number) => PAD + (index * (WIDTH - PAD * 2)) / Math.max(1, count - 1);
  const y = (value: number) => PAD + ((HIGH - value) / (HIGH - LOW)) * (HEIGHT - PAD * 2);
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join('');
  const area = `${line}L${x(count - 1).toFixed(1)} ${HEIGHT}L${x(0).toFixed(1)} ${HEIGHT}Z`;
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, count);
  const last = values[count - 1] ?? HIGH;

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Hourly uptime over the last ${count} hours, averaging ${mean.toFixed(1)} percent`}
    >
      <line className="sp-ref" x1="0" x2={WIDTH} y1={y(HIGH).toFixed(1)} y2={y(HIGH).toFixed(1)} />
      <path className="sp-area" d={area} />
      <path className="sp-line" d={line} />
      <circle className="sp-dot" cx={x(count - 1).toFixed(1)} cy={y(last).toFixed(1)} r="2.6" />
    </svg>
  );
}

import './sparkline.css';

const PAD = 3;

interface SparklineProps {
  /** Oldest first. The scale runs from zero to the largest value. */
  values: readonly number[];
  /** What the line shows, for screen readers. */
  label: string;
  /** Drawing size; the element scales with its CSS width. */
  width?: number;
  height?: number;
  /** One line of hover text per value, such as "3 PM: 120 units". */
  pointLabels?: readonly string[];
  className?: string;
}

export function Sparkline({ values, label, width = 120, height = 30, pointLabels, className }: SparklineProps) {
  const count = values.length;
  const high = Math.max(1, ...values);
  const step = (width - PAD * 2) / Math.max(1, count - 1);
  const x = (index: number) => PAD + index * step;
  const y = (value: number) => PAD + (1 - value / high) * (height - PAD * 2);
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join('');
  const area = `${line}L${x(count - 1).toFixed(1)} ${height}L${x(0).toFixed(1)} ${height}Z`;
  const last = values[count - 1] ?? 0;

  return (
    <svg
      className={className ? `spark ${className}` : 'spark'}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <line className="sp-ref" x1="0" x2={width} y1={y(0).toFixed(1)} y2={y(0).toFixed(1)} />
      {count > 0 && <path className="sp-area" d={area} />}
      {count > 0 && <path className="sp-line" d={line} />}
      {count > 0 && <circle className="sp-dot" cx={x(count - 1).toFixed(1)} cy={y(last).toFixed(1)} r="2.6" />}
      {pointLabels?.map((text, index) => (
        <g key={index} className="sp-point">
          <line className="sp-guide" x1={x(index).toFixed(1)} x2={x(index).toFixed(1)} y1="0" y2={height} />
          <circle className="sp-mark" cx={x(index).toFixed(1)} cy={y(values[index] ?? 0).toFixed(1)} r="3" />
          <rect className="sp-hit" x={(x(index) - step / 2).toFixed(1)} y="0" width={step.toFixed(1)} height={height}>
            <title>{text}</title>
          </rect>
        </g>
      ))}
    </svg>
  );
}

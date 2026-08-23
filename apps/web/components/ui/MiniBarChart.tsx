interface MiniBarChartProps {
  label: string;
  data: Array<{ date: string; value: number }>;
  prefix?: string;
  color?: string;
}

/**
 * Dependency-free daily bar chart — the dashboard only needs a rough trend
 * shape, not an interactive charting library, so plain SVG keeps the bundle
 * light and avoids pulling in a new package for seven small sparklines.
 */
export function MiniBarChart({ label, data, prefix = "", color = "#16a34a" }: MiniBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = 280;
  const height = 64;
  const barWidth = width / data.length;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-bold text-ink-900">
          {prefix}
          {total.toLocaleString()}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - 4);
          return (
            <rect
              key={d.date}
              x={i * barWidth + 1}
              y={height - barHeight}
              width={Math.max(1, barWidth - 2)}
              height={barHeight}
              fill={color}
              opacity={d.value === 0 ? 0.15 : 0.85}
              rx={1}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-300">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

// Grouped column chart as plain SVG (no chart library). One colour per child, fixed by
// entity; hover tooltips via <title>; a table view underneath for exact values.

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
}

const W = 640;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 34, left: 34 };
const BAR = 18;
const GAP = 2;
const RADIUS = 4;

/** Column with a 4px rounded top and a square base. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function niceMax(value: number) {
  if (value <= 0) return 10;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step;
  return 10 * step;
}

export function GroupedColumns({
  title,
  subtitle,
  categories,
  series,
  max,
  unit = "",
}: {
  title: string;
  subtitle?: string;
  categories: string[];
  series: Series[];
  max?: number;
  unit?: string;
}) {
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const top = max ?? Math.max(niceMax(dataMax), 10);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(categories.length, 1);
  const groupW = series.length * BAR + (series.length - 1) * GAP;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks = [0, top / 2, top];
  const empty = categories.length === 0 || series.every((s) => s.values.every((v) => v === null));

  return (
    <figure className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <figcaption className="mb-2">
        <div className="font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      </figcaption>

      {empty ? (
        <p className="py-8 text-center text-sm text-slate-500">No data yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#6b7280">
                {Math.round(t)}
              </text>
            </g>
          ))}
          {categories.map((c, ci) => {
            const gx = PAD.left + ci * band + (band - groupW) / 2;
            return (
              <g key={c}>
                {series.map((s, si) => {
                  const v = s.values[ci];
                  if (v === null || v === undefined) return null;
                  const h = Math.max((Math.min(v, top) / top) * plotH, v > 0 ? 1 : 0);
                  const x = gx + si * (BAR + GAP);
                  return (
                    <g key={s.name}>
                      <title>{`${s.name} · ${c}: ${v}${unit}`}</title>
                      {/* Larger invisible hit target for the tooltip. */}
                      <rect x={x - 1} y={PAD.top} width={BAR + 2} height={plotH} fill="transparent" />
                      {h > 0 && <path d={columnPath(x, y(0) - h, BAR, h)} fill={s.color} />}
                    </g>
                  );
                })}
                <text x={PAD.left + ci * band + band / 2} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={11} fill="#4b5563">
                  {c}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-indigo-600">Show as table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 pr-2 font-medium" />
              {series.map((s) => (
                <th key={s.name} className="py-1 pr-2 font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c, ci) => (
              <tr key={c} className="border-t border-slate-100">
                <td className="py-1 pr-2">{c}</td>
                {series.map((s) => (
                  <td key={s.name} className="py-1 pr-2 tabular-nums">
                    {s.values[ci] === null ? "—" : `${s.values[ci]}${unit}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

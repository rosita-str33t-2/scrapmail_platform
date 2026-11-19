"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

export type TrendPoint = { date: string; value: number };

const HEIGHT = 180;
const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

/** Clean upper bound for the y axis (1, 2, 2.5, 5 × 10^n). */
function niceMax(max: number) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One series over time as a 2px line with a 10% area wash, hairline grid, and a
 * crosshair that snaps to the nearest day (pointer and arrow keys).
 */
export function TrendChart({
  label,
  data,
  color,
}: {
  label: string;
  data: TrendPoint[];
  /** CSS color of the series, e.g. "var(--chart-1)". */
  color: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = data.length;
  const total = data.reduce((sum, p) => sum + p.value, 0);
  const max = niceMax(Math.max(0, ...data.map((p) => p.value)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = data
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`)
    .join("");
  const area = n ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(
    1,
    Math.ceil(n / Math.max(2, Math.floor(innerW / 90))),
  );

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - PAD.left) / innerW) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!n) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) =>
        Math.min(n - 1, Math.max(0, (a ?? (step > 0 ? -1 : n)) + step)),
      );
    }
  };

  const point = active !== null ? data[active] : undefined;

  return (
    <div>
      <p className="flex items-baseline gap-2 text-sm text-muted-foreground">
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-3 rounded-full"
          style={{ background: color }}
        />
        {label}
        <span className="text-base font-semibold text-foreground tabular-nums">
          {total.toLocaleString()}
        </span>
      </p>
      <div ref={box} className="relative mt-2">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label} per day: ${total.toLocaleString()} in total. Use the arrow keys to read each day.`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {t.toLocaleString()}
              </text>
            </g>
          ))}
          {data.map((p, i) =>
            (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) ||
            i === n - 1 ? (
              <text
                key={p.date}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[11px]"
              >
                {shortDate(p.date)}
              </text>
            ) : null,
          )}
          {n > 0 && (
            <>
              <path d={area} fill={color} fillOpacity={0.1} />
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}
          {point && active !== null && (
            <>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.5}
                strokeWidth={1}
              />
              <circle
                cx={x(active)}
                cy={y(point.value)}
                r={4}
                fill={color}
                stroke="var(--card)"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
        {point && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(x(active) - 60, 0), width - 120),
              width: 120,
            }}
          >
            <p className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-2.5 rounded-full"
                style={{ background: color }}
              />
              <span className="font-semibold tabular-nums">
                {point.value.toLocaleString()}
              </span>
              <span className="text-muted-foreground">
                {label.toLowerCase()}
              </span>
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {shortDate(point.date)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

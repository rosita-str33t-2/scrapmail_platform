import { PlugZap, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/app/status-badge";
import { CAMPAIGN_STATUS } from "@/lib/instantly-api";
import { cn } from "@/lib/utils";

export function CampaignStatusBadge({ status }: { status: number }) {
  const s = CAMPAIGN_STATUS[status] ?? { label: "Unknown", tone: "neutral" };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** "12.5%" of a part of a whole; "—" when the whole is 0. */
export function pct(part: number, whole: number) {
  if (!whole) return "—";
  const v = (part / whole) * 100;
  return `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1)}%`;
}

export function ProgressBar({
  value,
  className,
}: {
  /** 0 to 1. */
  value: number;
  className?: string;
}) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="text-xs font-medium tabular-nums">
        {Math.round(v * 100)}%
      </span>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-accent">
        <span
          className="block h-full rounded-full bg-success"
          style={{ width: `${v * 100}%` }}
        />
      </span>
    </span>
  );
}

/** Date ranges of the campaign pages ("4w" = last 4 weeks, the default). */
export const RANGES = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "", label: "Last 4 weeks", days: 28 },
  { value: "3m", label: "Last 3 months", days: 91 },
  { value: "all", label: "All time", days: 0 },
] as const;

/** The range's first and last day (UTC, YYYY-MM-DD); all time has no start. */
export function rangeDates(value: string | undefined, since?: string) {
  const range = RANGES.find((r) => r.value === (value ?? "")) ?? RANGES[1];
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = range.days
    ? new Date(end.getTime() - (range.days - 1) * 86_400_000)
    : since
      ? new Date(since)
      : new Date(end.getTime() - 89 * 86_400_000);
  return {
    range,
    start: day(start),
    end: day(end),
    /** For totals: all time sends no dates at all. */
    totals: range.days ? { start: day(start), end: day(end) } : {},
  };
}

/** Every day from start to end, with 0 where Instantly has no entry. */
export function fillDays<T extends { date: string }>(
  rows: T[],
  start: string,
  end: string,
  pick: (row: T) => number,
) {
  const byDate = new Map(rows.map((r) => [r.date, pick(r)]));
  const out: { date: string; value: number }[] = [];
  for (
    let t = Date.parse(`${start}T00:00:00Z`);
    t <= Date.parse(`${end}T00:00:00Z`) && out.length < 3700;
    t += 86_400_000
  ) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, value: byDate.get(date) ?? 0 });
  }
  return out;
}

/** Shown instead of the data when Instantly is not connected or answers with an error. */
export function InstantlyNotice({
  kind,
  message,
}: {
  kind: "setup" | "error";
  message?: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center rounded-lg border bg-card px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-accent">
        {kind === "setup" ? (
          <PlugZap
            className="size-5 text-muted-foreground"
            strokeWidth={1.75}
          />
        ) : (
          <TriangleAlert className="size-5 text-warning" strokeWidth={1.75} />
        )}
      </span>
      <p className="mt-4 font-semibold">
        {kind === "setup"
          ? "Connect your Instantly account"
          : "Could not load data from Instantly"}
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {kind === "setup"
          ? "Add the Instantly API key (read access) as INSTANTLY_API_KEY in the server settings, then restart the site."
          : (message ?? "Please try again in a moment.")}
      </p>
    </div>
  );
}

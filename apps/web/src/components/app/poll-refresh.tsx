"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { cn } from "@/lib/utils";

/**
 * Re-renders the page with fresh data every `intervalMs` while the tab is visible
 * (for data from outside our database, e.g. Instantly). Catches up at once when
 * the tab is shown again. Shows when the data was last updated.
 */
export function PollRefresh({
  intervalMs = 30_000,
  className,
}: {
  intervalMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const last = useRef(0);

  useEffect(() => {
    last.current = Date.now(); // the page was just rendered with fresh data
    const refresh = () => {
      if (document.hidden) return;
      last.current = Date.now();
      startRefresh(() => router.refresh());
    };
    const tick = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - last.current >= intervalMs) refresh();
    }, 1000);
    const onVisible = () => {
      if (!document.hidden && Date.now() - last.current >= intervalMs)
        refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);

  // A finished refresh means the page now shows fresh data.
  useEffect(() => {
    if (!refreshing) setUpdatedAt(last.current);
  }, [refreshing]);

  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <span
      title={`Updates every ${intervalMs / 1000} seconds from Instantly`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md bg-success-surface px-2 text-xs font-medium text-success",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full bg-current",
          refreshing && "animate-pulse",
        )}
      />
      Live
      <span className="font-normal tabular-nums opacity-80">
        ·{" "}
        {refreshing
          ? "updating…"
          : seconds < 5
            ? "just now"
            : `${seconds}s ago`}
      </span>
    </span>
  );
}

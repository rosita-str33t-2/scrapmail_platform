"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { cn } from "@/lib/utils";

import { type LiveKind, useLiveChanges } from "./live-updates";

/** At most one refresh per second. */
const MIN_INTERVAL_MS = 1000;
/**
 * The database sends at most one message per 750 ms; changes right after a message
 * are picked up by one more refresh this long after the last message.
 */
const SETTLE_MS = 1200;
/** While the live connection is down, refresh this often instead. */
const FALLBACK_POLL_MS = 15_000;

/**
 * Keeps the page in sync for every user: re-renders it with fresh data as soon as
 * the database reports a change to what it shows (Supabase Realtime, usually well
 * under a second). One refresh at a time, none while the tab is hidden (it catches
 * up when shown).
 *
 * `pollMs`: also refresh this often (data from outside our database, e.g. Instantly
 * changes that send no webhook); shows when the data was last updated.
 */
export function LiveRefresh({
  kinds,
  pollMs,
  className,
}: {
  kinds: LiveKind[];
  pollMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refreshingRef = useRef(false);
  const last = useRef(0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<() => void>(() => {});
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    last.current = Date.now(); // the page was just rendered with fresh data
    const run = () => {
      timer.current = null;
      if (!dirty.current || document.hidden) return;
      const wait = last.current + MIN_INTERVAL_MS - Date.now();
      if (refreshingRef.current || wait > 0) {
        timer.current = setTimeout(run, Math.max(wait, 100));
        return;
      }
      dirty.current = false;
      last.current = Date.now();
      startRefresh(() => router.refresh());
    };
    request.current = () => {
      dirty.current = true;
      if (!timer.current) timer.current = setTimeout(run, 0);
    };
    const onVisible = () => {
      if (!document.hidden && dirty.current) request.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      if (settle.current) clearTimeout(settle.current);
      timer.current = null;
      settle.current = null;
    };
  }, [router]);

  // A finished refresh: run the next one if more changes came in meanwhile.
  useEffect(() => {
    refreshingRef.current = refreshing;
    if (!refreshing) {
      setUpdatedAt(last.current);
      if (dirty.current) request.current();
    }
  }, [refreshing]);

  const connected = useLiveChanges(kinds, () => {
    request.current();
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => request.current(), SETTLE_MS);
  });

  // Regular refresh for outside data, or as a fallback while disconnected.
  const interval = pollMs ?? (connected ? null : FALLBACK_POLL_MS);
  useEffect(() => {
    if (!interval && !pollMs) return;
    const tick = setInterval(() => {
      setNow(Date.now());
      if (interval && Date.now() - last.current >= interval) request.current();
    }, 1000);
    return () => clearInterval(tick);
  }, [interval, pollMs]);

  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-500",
        connected
          ? "bg-success-surface text-success"
          : "bg-neutral-surface text-neutral",
        className,
      )}
      title={
        connected
          ? "Connected: changes appear here within a second"
          : "Connecting to live updates…"
      }
    >
      <span className="relative flex size-2">
        {connected && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            connected ? "bg-success" : "bg-neutral",
            refreshing && "animate-pulse",
          )}
        />
      </span>
      {connected ? "Live" : "Connecting"}
      {pollMs && (
        <span className="font-normal tabular-nums opacity-80">
          ·{" "}
          {refreshing
            ? "updating…"
            : seconds < 5
              ? "just now"
              : `${seconds}s ago`}
        </span>
      )}
    </span>
  );
}

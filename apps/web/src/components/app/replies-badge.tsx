"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { useLiveChanges } from "./live-updates";

/** Replies from leads that nobody has handled yet (auto-replies not counted). */
async function countOpenReplies() {
  const { count } = await createClient()
    .from("campaign_replies")
    .select("id", { count: "exact", head: true })
    .is("handled_at", null)
    .eq("is_auto_reply", false);
  return count ?? 0;
}

/**
 * Number of new replies, updated as soon as a reply comes in or is marked as done
 * (live updates), and every 2 minutes as a fallback. Renders nothing while there
 * are none.
 */
export function RepliesBadge({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  const alive = useRef(true);

  const load = useCallback(() => {
    if (document.hidden) return;
    countOpenReplies()
      .then((n) => alive.current && setCount(n))
      .catch(() => {});
  }, []);

  useLiveChanges(["replies"], load);

  useEffect(() => {
    alive.current = true;
    load();
    const timer = setInterval(load, 120_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [load]);

  if (!count) return null;
  return (
    <span
      aria-label={`${count} new ${count === 1 ? "reply" : "replies"}`}
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

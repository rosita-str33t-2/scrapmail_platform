"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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
 * Number of new replies, refreshed every 30 seconds (and when the tab is shown
 * again). Renders nothing while there are none.
 */
export function RepliesBadge({ className }: { className?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      countOpenReplies()
        .then((n) => alive && setCount(n))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

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

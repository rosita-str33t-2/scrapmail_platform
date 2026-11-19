import "server-only";

import {
  jobSignature,
  loadJobStats,
  storeJobStats,
} from "@/lib/scraping-stats";
import { instantlyConfigured } from "@/lib/instantly-api";
import { canSendReplies } from "@/lib/send-permission";
import { createAdminClient } from "@/lib/supabase/admin";

/** How often the server warms up (the statistics cache keeps 5 minutes). */
const EVERY_MS = 4 * 60_000;

/**
 * Keeps the slowest data ready so that even the first visit to a page is fast:
 * the scraping statistics are computed ahead of time, and the database keeps the
 * contact and agency lists in memory. Runs once shortly after the server starts,
 * then every 4 minutes, with the server's own key (no user data leaves the server).
 */
async function warmUp() {
  // Whether replies can be sent (checked ahead, so conversations never wait).
  if (instantlyConfigured()) void canSendReplies();
  const admin = createAdminClient();
  const { data: workspaces } = await admin.from("workspaces").select("id");
  for (const { id } of workspaces ?? []) {
    const [{ data: jobs }, stats] = await Promise.all([
      admin
        .from("scrape_jobs")
        .select("id, status, done_tasks, failed_tasks")
        .eq("workspace_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      loadJobStats(admin, id),
    ]);
    storeJobStats(id, jobSignature(jobs ?? []), stats);
    // Read the lists the pages count, so they stay in the database's memory.
    await Promise.all([
      admin
        .from("contact_list")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", id)
        .is("blocked", null),
      admin
        .from("agencies")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", id),
    ]);
  }
}

let started = false;

export function startWarmUp() {
  if (started) return;
  started = true;
  let first = true;
  const run = () => {
    const t = Date.now();
    return warmUp()
      .then(() => {
        if (first) console.log(`✓ Page data warmed up in ${Date.now() - t} ms`);
        first = false;
      })
      .catch((error: unknown) =>
        console.warn("warm-up skipped:", (error as Error)?.message ?? error),
      );
  };
  setTimeout(run, 3000).unref();
  setInterval(run, EVERY_MS).unref();
}

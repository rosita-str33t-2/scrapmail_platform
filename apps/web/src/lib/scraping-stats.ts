import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Scraping statistics of a workspace, shown on the Scraping Jobs page. */
export type Ranking = { country_code: string; searched: boolean };
export type DiscoveryStats = {
  job_id: string;
  accepted: number;
  rejected: number;
  pending: number;
};
export type JobStats = {
  /** Agencies with a website that can be checked. */
  linkSites: number;
  ranking: Ranking[];
  stats: DiscoveryStats[];
};

type JobProgress = {
  id: string;
  status: string;
  done_tasks: number;
  failed_tasks: number;
};

/**
 * The statistics scan the whole scraping history, but only change while jobs run.
 * They are reused while the progress of every job is the same as when they were
 * loaded (for 5 minutes at most); the server also loads them ahead (lib/warmup.ts).
 */
type Entry = { at: number; signature: string; value: JobStats };
// On globalThis: the server start-up code (warm-up) and the pages are bundled
// separately, and must share one cache.
const shared = globalThis as typeof globalThis & {
  __scrapmailJobStats?: Map<string, Entry>;
};
const cache = (shared.__scrapmailJobStats ??= new Map<string, Entry>());
const MAX_AGE_MS = 5 * 60_000;

export function jobSignature(jobs: JobProgress[]) {
  return jobs
    .map((j) => `${j.id}:${j.status}:${j.done_tasks}:${j.failed_tasks}`)
    .join("|");
}

export async function loadJobStats(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<JobStats> {
  const [{ count }, { data: ranking }, { data: stats }] = await Promise.all([
    supabase
      .from("agencies")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .not("website_url", "is", null)
      .or("website_status.is.null,website_status.eq.ok"),
    supabase.rpc("search_country_ranking", { p_workspace_id: workspaceId }),
    supabase.rpc("recent_discovery_job_stats", {
      p_workspace_id: workspaceId,
    }),
  ]);
  return {
    linkSites: count ?? 0,
    ranking: (ranking ?? []) as Ranking[],
    stats: (stats ?? []) as DiscoveryStats[],
  };
}

/** Statistics for the page: from the cache while no job moved on. */
export async function cachedJobStats(
  workspaceId: string,
  jobs: PromiseLike<JobProgress[]>,
  load: () => Promise<JobStats>,
): Promise<JobStats> {
  const cached = cache.get(workspaceId);
  const fresh = cached && Date.now() - cached.at < MAX_AGE_MS;
  // Without a recent copy, load at the same time as the job list.
  const early = fresh ? null : load();
  const signature = jobSignature(await jobs);
  if (!early && cached?.signature === signature) return cached.value;
  const value = await (early ?? load());
  cache.set(workspaceId, { at: Date.now(), signature, value });
  return value;
}

/** Loads the statistics ahead of time (background warm-up). */
export function storeJobStats(
  workspaceId: string,
  signature: string,
  value: JobStats,
) {
  cache.set(workspaceId, { at: Date.now(), signature, value });
}

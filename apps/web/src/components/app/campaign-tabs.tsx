import { TriangleAlert } from "lucide-react";
import { cache } from "react";

import { PageTabs } from "@/components/app/page-header";
import { createClient } from "@/lib/supabase/server";

/**
 * Numbers on the tabs, once per request. Pages call it first thing, so the numbers
 * load while the page loads its own data (not after it).
 */
export const preloadSectionCounts = cache(async () => {
  const supabase = await createClient();
  return Promise.all([
    supabase
      .from("campaign_replies")
      .select("id", { count: "exact", head: true })
      .is("handled_at", null)
      .eq("is_auto_reply", false),
    supabase
      .from("campaign_lead_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "bounced"),
  ]);
});

/** Campaigns / Replies / Bounces, with the number of new replies and of bounces. */
export async function CampaignSectionTabs({
  active,
}: {
  active: "campaigns" | "replies" | "bounces";
}) {
  const [open, bounces] = await preloadSectionCounts();
  return (
    <PageTabs
      label="Email campaigns"
      tabs={[
        {
          label: "Campaigns",
          href: "/campaigns",
          active: active === "campaigns",
        },
        {
          label: "Replies",
          href: "/campaigns/replies",
          active: active === "replies",
          count: open.count || undefined,
        },
        {
          label: "Bounces",
          href: "/campaigns/bounces",
          active: active === "bounces",
          count: bounces.count || undefined,
        },
      ]}
    />
  );
}

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Sync state, once per request (pages preload it like the tab numbers). */
export const preloadSyncStatus = cache(async () => {
  const supabase = await createClient();
  return supabase
    .from("instantly_sync_state")
    .select("last_sync_at, last_webhook_at, last_error")
    .maybeSingle<{
      last_sync_at: string | null;
      last_webhook_at: string | null;
      last_error: string | null;
    }>();
});

/** When replies and bounces were last synced from Instantly, and any sync error. */
export async function SyncStatus() {
  const { data } = await preloadSyncStatus();
  if (!data?.last_sync_at) {
    return (
      <p className="text-xs text-muted-foreground">
        Waiting for the first sync with Instantly…
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Checked with Instantly {ago(data.last_sync_at)}</span>
      {data.last_webhook_at && (
        <span>· last live update {ago(data.last_webhook_at)}</span>
      )}
      {data.last_error && (
        <span className="flex items-center gap-1 text-warning">
          <TriangleAlert className="size-3.5" /> Last sync failed:{" "}
          {data.last_error}
        </span>
      )}
    </p>
  );
}

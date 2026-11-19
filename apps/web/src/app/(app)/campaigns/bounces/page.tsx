import { Ban, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  CampaignSectionTabs,
  preloadSectionCounts,
  preloadSyncStatus,
  SyncStatus,
} from "@/components/app/campaign-tabs";
import {
  FilterSelect,
  Pagination,
  SearchInput,
  TableFrame,
} from "@/components/app/data-table";
import { EmptyState, PageHeader, Toolbar } from "@/components/app/page-header";
import { LiveRefresh } from "@/components/app/live-refresh";
import { StatusBadge } from "@/components/app/status-badge";
import { requireWorkspace } from "@/lib/auth/workspace";
import { agenciesForEmails } from "@/lib/lead-agencies";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bounces" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

type LeadEvent = {
  id: number;
  kind: "bounced" | "unsubscribed";
  campaign_id: string;
  campaign_name: string | null;
  lead_email: string;
  lead_email_normalized: string;
  eaccount: string | null;
  occurred_at: string;
};

export default async function BouncesPage({ searchParams }: Props) {
  // Header numbers load while this page loads its list (RLS limits them).
  void preloadSectionCounts();
  void preloadSyncStatus();
  const { workspaceId } = await requireWorkspace();
  const params = await searchParams;
  const kind =
    params.type === "unsubscribed" || params.type === "all"
      ? params.type
      : "bounced";
  const size = 50;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const q = (params.q ?? "")
    .replace(/[%,()*]/g, " ")
    .trim()
    .toLowerCase();

  const supabase = await createClient();
  // Filter choices, loaded at the same time as the list below.
  const facetsQuery = supabase
    .from("campaign_lead_events")
    .select("campaign_id, campaign_name, eaccount")
    .eq("workspace_id", workspaceId)
    .limit(10000)
    .returns<Pick<LeadEvent, "campaign_id" | "campaign_name" | "eaccount">[]>();

  let query = supabase
    .from("campaign_lead_events")
    .select(
      "id, kind, campaign_id, campaign_name, lead_email, lead_email_normalized, eaccount, occurred_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);
  if (kind !== "all") query = query.eq("kind", kind);
  if (params.campaign) query = query.eq("campaign_id", params.campaign);
  if (params.mailbox) query = query.eq("eaccount", params.mailbox);
  if (q) query = query.ilike("lead_email_normalized", `%${q}%`);
  const [{ data: facets }, { data: events, count }] = await Promise.all([
    facetsQuery,
    query
      .order("occurred_at", { ascending: false })
      .range((page - 1) * size, page * size - 1)
      .returns<LeadEvent[]>(),
  ]);
  const campaigns = new Map<string, string>();
  const mailboxes = new Map<string, number>();
  for (const f of facets ?? []) {
    if (f.campaign_id)
      campaigns.set(f.campaign_id, f.campaign_name ?? "Unnamed campaign");
    if (f.eaccount)
      mailboxes.set(f.eaccount, (mailboxes.get(f.eaccount) ?? 0) + 1);
  }
  const agencies = await agenciesForEmails(
    supabase,
    workspaceId,
    (events ?? []).map((e) => e.lead_email_normalized),
  );

  return (
    <>
      <PageHeader
        title="Email Campaigns"
        tabs={<CampaignSectionTabs active="bounces" />}
        actions={<LiveRefresh kinds={["bounces", "replies"]} />}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Ban className="size-3.5" />
          Bounced and unsubscribed addresses are blocked: they are never
          exported again.
        </p>
        <SyncStatus />
      </div>

      <Toolbar>
        <SearchInput placeholder="Search email…" />
        <FilterSelect
          param="type"
          label="Bounced"
          options={[
            { value: "", label: "Bounced" },
            { value: "unsubscribed", label: "Unsubscribed" },
            { value: "all", label: "Bounced and unsubscribed" },
          ]}
        />
        <FilterSelect
          param="campaign"
          label="Campaign"
          options={[
            { value: "", label: "All campaigns" },
            ...[...campaigns].map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <FilterSelect
          param="mailbox"
          label="Sent from"
          options={[
            { value: "", label: "All sending accounts" },
            ...[...mailboxes]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([email, n]) => ({
                value: email,
                label: email,
                hint: String(n),
              })),
          ]}
        />
        <Pagination
          page={page}
          pageSize={size}
          total={count ?? 0}
          className="ml-auto"
        />
      </Toolbar>

      {!events?.length ? (
        <EmptyState
          title={kind === "unsubscribed" ? "No unsubscribes" : "No bounces"}
          text="Bounces from your Instantly campaigns appear here within seconds."
        />
      ) : (
        <TableFrame className="min-h-0">
          <table>
            <thead>
              <tr>
                <th className="px-4">Date</th>
                <th className="px-4">Email</th>
                <th className="px-4">Sent from</th>
                <th className="px-4">Campaign</th>
                <th className="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const agency = agencies.get(e.lead_email_normalized);
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{e.lead_email}</span>
                      {agency && (
                        <Link
                          href={`/agencies/${agency.id}`}
                          className="block text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          {agency.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Inbox className="size-3.5 text-muted-foreground" />
                        {e.eaccount ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {e.campaign_id ? (
                        <Link
                          href={`/campaigns/${e.campaign_id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {e.campaign_name ?? "Campaign"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={e.kind === "bounced" ? "danger" : "warning"}
                      >
                        {e.kind === "bounced" ? "Bounced" : "Unsubscribed"}
                      </StatusBadge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Blocked from export
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
    </>
  );
}

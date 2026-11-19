import { CornerUpLeft, Inbox, MessageSquareReply } from "lucide-react";
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
import { ReplyDoneButton } from "@/components/app/reply-done-button";
import { StatusBadge } from "@/components/app/status-badge";
import { requireWorkspace } from "@/lib/auth/workspace";
import { interestStatus } from "@/lib/interest-status";
import { agenciesForEmails } from "@/lib/lead-agencies";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Replies" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

type Reply = {
  id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  lead_email: string;
  lead_email_normalized: string;
  eaccount: string | null;
  subject: string | null;
  preview: string | null;
  step: string | null;
  is_auto_reply: boolean;
  interest_status: number | null;
  received_at: string;
  handled_at: string | null;
  replied_at: string | null;
};

/** Which replies a view shows. */
const VIEWS = [
  { value: "", label: "Needs attention" },
  { value: "auto", label: "Auto-replies" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
] as const;

function viewHref(params: Record<string, string | undefined>, view: string) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "view" && k !== "page") next.set(k, v);
  }
  if (view) next.set("view", view);
  const query = next.toString();
  return query ? `/campaigns/replies?${query}` : "/campaigns/replies";
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Instantly's step "0_0_0" -> "Step 1". */
function stepLabel(step: string | null) {
  const n = Number.parseInt(step ?? "", 10);
  return Number.isInteger(n) ? `Step ${n + 1}` : null;
}

export default async function RepliesPage({ searchParams }: Props) {
  // Header numbers load while this page loads its list (RLS limits them).
  void preloadSectionCounts();
  void preloadSyncStatus();
  const { workspaceId } = await requireWorkspace();
  const params = await searchParams;
  const view = VIEWS.find((v) => v.value === (params.view ?? "")) ?? VIEWS[0];
  const size = 50;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const q = (params.q ?? "")
    .replace(/[%,()*]/g, " ")
    .trim()
    .toLowerCase();

  const supabase = await createClient();

  // Campaigns and mailboxes that have replies (for the filters) and view counts.
  // Loaded at the same time as the list below.
  const facetsQuery = supabase
    .from("campaign_replies")
    .select("campaign_id, campaign_name, eaccount, is_auto_reply, handled_at")
    .eq("workspace_id", workspaceId)
    .limit(10000)
    .returns<
      Pick<
        Reply,
        | "campaign_id"
        | "campaign_name"
        | "eaccount"
        | "is_auto_reply"
        | "handled_at"
      >[]
    >();

  let query = supabase
    .from("campaign_replies")
    .select(
      "id, campaign_id, campaign_name, lead_email, lead_email_normalized, eaccount, subject, preview, step, is_auto_reply, interest_status, received_at, handled_at, replied_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId);
  if (view.value === "")
    query = query.is("handled_at", null).eq("is_auto_reply", false);
  if (view.value === "auto") query = query.eq("is_auto_reply", true);
  if (view.value === "done")
    query = query.not("handled_at", "is", null).eq("is_auto_reply", false);
  if (params.campaign) query = query.eq("campaign_id", params.campaign);
  if (params.mailbox) query = query.eq("eaccount", params.mailbox);
  if (q) query = query.ilike("lead_email_normalized", `%${q}%`);
  const [{ data: facets }, { data: replies, count }] = await Promise.all([
    facetsQuery,
    query
      .order("received_at", { ascending: false })
      .range((page - 1) * size, page * size - 1)
      .returns<Reply[]>(),
  ]);

  const campaigns = new Map<string, string>();
  const mailboxes = new Map<string, number>();
  for (const f of facets ?? []) {
    if (f.campaign_id)
      campaigns.set(f.campaign_id, f.campaign_name ?? "Unnamed campaign");
    if (f.eaccount)
      mailboxes.set(f.eaccount, (mailboxes.get(f.eaccount) ?? 0) + 1);
  }
  const inScope = (facets ?? []).filter(
    (f) =>
      (!params.campaign || f.campaign_id === params.campaign) &&
      (!params.mailbox || f.eaccount === params.mailbox),
  );
  const viewCount = {
    "": inScope.filter((f) => !f.handled_at && !f.is_auto_reply).length,
    auto: inScope.filter((f) => f.is_auto_reply).length,
    done: inScope.filter((f) => f.handled_at && !f.is_auto_reply).length,
    all: inScope.length,
  };

  const agencies = await agenciesForEmails(
    supabase,
    workspaceId,
    (replies ?? []).map((r) => r.lead_email_normalized),
  );

  return (
    <>
      <PageHeader
        title="Email Campaigns"
        tabs={<CampaignSectionTabs active="replies" />}
        actions={<LiveRefresh kinds={["replies", "bounces"]} />}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <nav
          aria-label="Reply status"
          className="flex flex-wrap gap-1 rounded-lg border bg-card p-1"
        >
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={viewHref(params, v.value)}
              scroll={false}
              aria-current={v.value === view.value ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                v.value === view.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
              <span className="text-xs text-muted-foreground tabular-nums">
                {viewCount[v.value].toLocaleString()}
              </span>
            </Link>
          ))}
        </nav>
        <SyncStatus />
      </div>

      <Toolbar>
        <SearchInput placeholder="Search lead email…" />
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
          label="Received by"
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

      {!replies?.length ? (
        <EmptyState
          title={
            view.value === "" ? "No replies need attention" : "No replies here"
          }
          text={
            view.value === ""
              ? "New replies from leads appear here within seconds. Auto-replies (out of office and similar) are under Auto-replies."
              : "Try another view or filter."
          }
        />
      ) : (
        <TableFrame className="min-h-0">
          <table>
            <thead>
              <tr>
                <th className="px-4">Received</th>
                <th className="px-4">From</th>
                <th className="px-4">Received by</th>
                <th className="px-4">Campaign</th>
                <th className="px-4">Message</th>
                <th className="px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {replies.map((r) => {
                const agency = agencies.get(r.lead_email_normalized);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {when(r.received_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.lead_email}</span>
                      {agency && (
                        <Link
                          href={`/agencies/${agency.id}`}
                          className="block text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          {agency.name}
                        </Link>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.is_auto_reply && (
                          <StatusBadge tone="neutral">Auto-reply</StatusBadge>
                        )}
                        {r.replied_at && (
                          <StatusBadge tone="info">
                            <CornerUpLeft className="size-3" /> Replied
                          </StatusBadge>
                        )}
                        {interestStatus(r.interest_status) && (
                          <StatusBadge
                            tone={interestStatus(r.interest_status)!.tone}
                          >
                            {interestStatus(r.interest_status)!.label}
                          </StatusBadge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Inbox className="size-3.5 text-muted-foreground" />
                        {r.eaccount ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.campaign_id ? (
                        <Link
                          href={`/campaigns/${r.campaign_id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {r.campaign_name ?? "Campaign"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          No campaign
                        </span>
                      )}
                      {stepLabel(r.step) && (
                        <div className="text-xs text-muted-foreground">
                          {stepLabel(r.step)}
                        </div>
                      )}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <Link
                        href={`/campaigns/replies/${r.id}`}
                        className="block truncate font-medium hover:text-primary hover:underline"
                      >
                        {r.subject || "(no subject)"}
                      </Link>
                      {r.preview && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {r.preview}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <ReplyDoneButton
                          id={r.id}
                          done={Boolean(r.handled_at)}
                        />
                        <Link
                          href={`/campaigns/replies/${r.id}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover"
                        >
                          <MessageSquareReply className="size-3.5" />
                          {r.is_auto_reply ? "Open" : "Reply"}
                        </Link>
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

import {
  ExternalLink,
  MailCheck,
  MessageSquareReply,
  Send,
  ShieldAlert,
  Trophy,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  CampaignStatusBadge,
  InstantlyNotice,
  pct,
  ProgressBar,
} from "@/components/app/campaign-ui";
import { CampaignSectionTabs } from "@/components/app/campaign-tabs";
import {
  FilterSelect,
  SearchInput,
  TableFrame,
} from "@/components/app/data-table";
import { EmptyState, PageHeader, Toolbar } from "@/components/app/page-header";
import { PollRefresh } from "@/components/app/poll-refresh";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/workspace";
import {
  type Campaign,
  type CampaignAnalytics,
  campaignAnalytics,
  InstantlyError,
  instantlyConfigured,
  listCampaigns,
} from "@/lib/instantly-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Email Campaigns" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/** Status filter: which Instantly statuses each choice shows. */
const TABS = [
  { value: "", label: "All campaigns", statuses: null },
  { value: "active", label: "Active", statuses: [1, 4] },
  { value: "paused", label: "Paused", statuses: [2] },
  { value: "completed", label: "Completed", statuses: [3] },
  { value: "draft", label: "Drafts", statuses: [0] },
  { value: "attention", label: "Need attention", statuses: [-1, -2, -99] },
] as const;

export default async function CampaignsPage({ searchParams }: Props) {
  await requireWorkspace();
  const params = await searchParams;
  const tab = TABS.find((t) => t.value === (params.status ?? "")) ?? TABS[0];
  const q = (params.q ?? "").trim().toLowerCase();

  const header = (description?: string) => (
    <PageHeader
      title="Email Campaigns"
      description={description}
      tabs={<CampaignSectionTabs active="campaigns" />}
      actions={
        <>
          {instantlyConfigured() && <PollRefresh />}
          <a
            href="https://app.instantly.ai/app/campaigns"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            Open Instantly <ExternalLink />
          </a>
        </>
      }
    />
  );

  if (!instantlyConfigured()) {
    return (
      <>
        {header()}
        <InstantlyNotice kind="setup" />
      </>
    );
  }

  let campaigns: Campaign[];
  let analytics: CampaignAnalytics[];
  try {
    [campaigns, analytics] = await Promise.all([
      listCampaigns(),
      campaignAnalytics(),
    ]);
  } catch (error) {
    return (
      <>
        {header()}
        <InstantlyNotice
          kind="error"
          message={error instanceof InstantlyError ? error.message : undefined}
        />
      </>
    );
  }

  const stats = new Map(analytics.map((a) => [a.campaign_id, a]));
  const matchesSearch = campaigns.filter(
    (c) => !q || c.name.toLowerCase().includes(q),
  );
  const shown = matchesSearch.filter(
    (c) =>
      !tab.statuses || (tab.statuses as readonly number[]).includes(c.status),
  );
  const count = (statuses: readonly number[] | null) =>
    matchesSearch.filter((c) => !statuses || statuses.includes(c.status))
      .length;

  // Totals of the campaigns shown.
  const sum = (pick: (a: CampaignAnalytics) => number) =>
    shown.reduce((total, c) => {
      const a = stats.get(c.id);
      return total + (a ? pick(a) : 0);
    }, 0);
  const contacted = sum((a) => a.contacted_count);
  const totals = [
    {
      icon: Send,
      label: "Emails sent",
      value: sum((a) => a.emails_sent_count).toLocaleString(),
      sub: `${contacted.toLocaleString()} leads contacted`,
    },
    {
      icon: MessageSquareReply,
      label: "Unique replies",
      value: sum((a) => a.reply_count_unique).toLocaleString(),
      sub: `${pct(
        sum((a) => a.reply_count_unique),
        contacted,
      )} reply rate`,
    },
    {
      icon: ShieldAlert,
      label: "Bounced",
      value: sum((a) => a.bounced_count).toLocaleString(),
      sub: `${pct(
        sum((a) => a.bounced_count),
        contacted,
      )} bounce rate`,
    },
    {
      icon: MailCheck,
      label: "Unsubscribed",
      value: sum((a) => a.unsubscribed_count).toLocaleString(),
      sub: `${pct(
        sum((a) => a.unsubscribed_count),
        contacted,
      )} of contacted`,
    },
    {
      icon: Trophy,
      label: "Opportunities",
      value: sum((a) => a.total_opportunities).toLocaleString(),
      sub: `$${sum((a) => a.total_opportunity_value).toLocaleString()} value`,
    },
  ];

  return (
    <>
      {header(`${campaigns.length.toLocaleString()} campaigns`)}

      <div className="mb-4 grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 lg:grid-cols-5">
        {totals.map((t) => (
          <div
            key={t.label}
            className="-mr-px -mb-px border-r border-b px-5 py-4"
          >
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <t.icon className="size-4" strokeWidth={1.75} />
              {t.label}
            </p>
            <p className="mt-1.5 text-2xl leading-none font-semibold tracking-tight tabular-nums">
              {t.value}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <Toolbar>
        <SearchInput placeholder="Search campaigns…" />
        <FilterSelect
          param="status"
          label="Status"
          options={TABS.filter(
            (t) =>
              !t.statuses || count(t.statuses) > 0 || t.value === tab.value,
          ).map((t) => ({
            value: t.value,
            label: t.label,
            hint: String(count(t.statuses)),
          }))}
        />
      </Toolbar>

      {shown.length === 0 ? (
        <EmptyState
          title="No campaigns here"
          text={
            campaigns.length
              ? "Try another tab or search."
              : "Campaigns you create in Instantly appear here automatically."
          }
        />
      ) : (
        <TableFrame className="min-h-0">
          <table>
            <thead>
              <tr>
                <th className="px-4">Name</th>
                <th className="px-4">Status</th>
                <th className="px-4">Progress</th>
                <th className="px-4 text-right">Sent</th>
                <th className="px-4 text-right">Replies</th>
                <th className="px-4 text-right">Bounced</th>
                <th className="px-4 text-right">Opportunities</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const a = stats.get(c.id);
                return (
                  <tr key={c.id} className="group">
                    <td className="px-4 py-3">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium group-hover:text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        Created{" "}
                        {new Date(c.timestamp_created).toLocaleDateString(
                          undefined,
                          {
                            dateStyle: "medium",
                          },
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CampaignStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar
                        value={
                          a?.leads_count ? a.contacted_count / a.leads_count : 0
                        }
                      />
                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {(a?.contacted_count ?? 0).toLocaleString()} of{" "}
                        {(a?.leads_count ?? 0).toLocaleString()} leads
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(a?.emails_sent_count ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(a?.reply_count_unique ?? 0).toLocaleString()}
                      <div className="text-xs text-muted-foreground">
                        {pct(
                          a?.reply_count_unique ?? 0,
                          a?.contacted_count ?? 0,
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={cn(
                          (a?.bounced_count ?? 0) > 0 && "text-danger",
                        )}
                      >
                        {(a?.bounced_count ?? 0).toLocaleString()}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {pct(a?.bounced_count ?? 0, a?.contacted_count ?? 0)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(a?.total_opportunities ?? 0).toLocaleString()}
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

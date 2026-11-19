import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CampaignStatusBadge,
  fillDays,
  InstantlyNotice,
  pct,
  ProgressBar,
  RANGES,
  rangeDates,
} from "@/components/app/campaign-ui";
import { FilterSelect, TableFrame } from "@/components/app/data-table";
import {
  PageHeader,
  PageTabs,
  Panel,
  Toolbar,
} from "@/components/app/page-header";
import { PollRefresh } from "@/components/app/poll-refresh";
import { TrendChart } from "@/components/app/trend-chart";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/workspace";
import {
  type Campaign,
  type CampaignAnalytics,
  campaignAnalytics,
  type DailyAnalytics,
  dailyAnalytics,
  getCampaign,
  InstantlyError,
  instantlyCampaignUrl,
  instantlyConfigured,
  type StepAnalytics,
  stepAnalytics,
} from "@/lib/instantly-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Campaign" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const VARIANTS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export default async function CampaignPage({ params, searchParams }: Props) {
  await requireWorkspace();
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const back = { href: "/campaigns", label: "All campaigns" };

  if (!instantlyConfigured()) {
    return (
      <>
        <PageHeader title="Campaign" back={back} />
        <InstantlyNotice kind="setup" />
      </>
    );
  }

  let campaign: Campaign;
  try {
    campaign = await getCampaign(id);
  } catch (error) {
    if (error instanceof InstantlyError && error.status === 404) notFound();
    return (
      <>
        <PageHeader title="Campaign" back={back} />
        <InstantlyNotice
          kind="error"
          message={error instanceof InstantlyError ? error.message : undefined}
        />
      </>
    );
  }

  const { range, start, end, totals } = rangeDates(
    query.range,
    campaign.timestamp_created,
  );
  let summary: CampaignAnalytics | undefined;
  let daily: DailyAnalytics[];
  let steps: StepAnalytics[];
  try {
    [[summary], daily, steps] = await Promise.all([
      campaignAnalytics({ id, ...totals }),
      dailyAnalytics(id, { start, end }),
      stepAnalytics(id, { start, end }),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title={campaign.name} back={back} />
        <InstantlyNotice
          kind="error"
          message={error instanceof InstantlyError ? error.message : undefined}
        />
      </>
    );
  }

  const a = summary;
  const contacted = a?.contacted_count ?? 0;
  const tiles = [
    {
      label: "Sequence started",
      value: contacted.toLocaleString(),
      sub: `${(a?.new_leads_contacted_count ?? 0).toLocaleString()} new leads`,
    },
    {
      label: "Total sent",
      value: (a?.emails_sent_count ?? 0).toLocaleString(),
      sub: `${(a?.leads_count ?? 0).toLocaleString()} leads in campaign`,
    },
    campaign.open_tracking
      ? {
          label: "Open rate",
          value: pct(a?.open_count_unique ?? 0, contacted),
          sub: `${(a?.open_count_unique ?? 0).toLocaleString()} opened`,
        }
      : {
          label: "Open rate",
          value: "Disabled",
          sub: "Open tracking is off",
          muted: true,
        },
    campaign.link_tracking
      ? {
          label: "Click rate",
          value: pct(a?.link_click_count_unique ?? 0, contacted),
          sub: `${(a?.link_click_count_unique ?? 0).toLocaleString()} clicked`,
        }
      : {
          label: "Click rate",
          value: "Disabled",
          sub: "Link tracking is off",
          muted: true,
        },
    {
      label: "Unique replies",
      value: (a?.reply_count_unique ?? 0).toLocaleString(),
      sub: `${pct(a?.reply_count_unique ?? 0, contacted)} · ${(a?.reply_count_automatic ?? 0).toLocaleString()} auto-replies`,
      tone: (a?.reply_count_unique ?? 0) > 0 ? "text-success" : undefined,
    },
    {
      label: "Bounced",
      value: (a?.bounced_count ?? 0).toLocaleString(),
      sub: `${pct(a?.bounced_count ?? 0, contacted)} · ${(a?.unsubscribed_count ?? 0).toLocaleString()} unsubscribed`,
      tone: (a?.bounced_count ?? 0) > 0 ? "text-danger" : undefined,
    },
    {
      label: "Opportunities",
      value: (a?.total_opportunities ?? 0).toLocaleString(),
      sub: `$${(a?.total_opportunity_value ?? 0).toLocaleString()} value`,
    },
  ];

  // Steps: Instantly counts them from 0 (step "0" is the first email).
  const zeroBased = steps.some((s) => s.step === "0");
  const stepName = (s: StepAnalytics) =>
    s.step === null
      ? "Unknown step"
      : `Step ${Number(s.step) + (zeroBased ? 1 : 0)}`;
  const byStep = new Map<string, StepAnalytics[]>();
  for (const s of steps) {
    const key = s.step ?? "?";
    byStep.set(key, [...(byStep.get(key) ?? []), s]);
  }
  const stepRows = [...byStep.entries()]
    .sort(([x], [y]) => (Number(x) || 0) - (Number(y) || 0))
    .map(([, variants]) => {
      const total = variants.reduce(
        (t, v) => ({
          ...t,
          sent: t.sent + v.sent,
          unique_opened: t.unique_opened + v.unique_opened,
          unique_replies: t.unique_replies + v.unique_replies,
          unique_replies_automatic:
            t.unique_replies_automatic + v.unique_replies_automatic,
          unique_clicks: t.unique_clicks + v.unique_clicks,
          opportunities: (t.opportunities ?? 0) + (v.opportunities ?? 0),
          meetings_booked: (t.meetings_booked ?? 0) + (v.meetings_booked ?? 0),
          won: (t.won ?? 0) + (v.won ?? 0),
        }),
        {
          ...variants[0]!,
          sent: 0,
          unique_opened: 0,
          unique_replies: 0,
          unique_replies_automatic: 0,
          unique_clicks: 0,
          opportunities: 0,
          meetings_booked: 0,
          won: 0,
          variant: null,
        },
      );
      return {
        total,
        variants: variants.length > 1 || variants[0]?.variant ? variants : [],
      };
    });

  const progress = a?.leads_count ? contacted / a.leads_count : 0;

  return (
    <>
      <PageHeader
        title={campaign.name}
        back={back}
        tabs={
          <PageTabs
            label="Campaign"
            tabs={[
              { label: "Analytics", href: `/campaigns/${id}`, active: true },
            ]}
          />
        }
        actions={
          <>
            <CampaignStatusBadge status={campaign.status} />
            <PollRefresh />
            <a
              href={instantlyCampaignUrl(id)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              Open in Instantly <ExternalLink />
            </a>
          </>
        }
      />

      <Toolbar>
        <FilterSelect
          param="range"
          label={range.label}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <span className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
          <ProgressBar value={progress} />
          of {(a?.leads_count ?? 0).toLocaleString()} leads contacted
        </span>
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-card px-4 py-4">
            <p className="text-[13px] text-muted-foreground">{t.label}</p>
            <p
              className={cn(
                "mt-2 text-2xl leading-none font-semibold tracking-tight tabular-nums",
                "muted" in t && t.muted && "text-muted-foreground",
                "tone" in t && t.tone,
              )}
            >
              {t.value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <Panel
        className="mt-4"
        title="Performance trend"
        description={`Per day, ${new Date(`${start}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" })} to ${new Date(`${end}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" })}`}
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <TrendChart
            label="Sent"
            color="var(--chart-1)"
            data={fillDays(daily, start, end, (d) => d.sent)}
          />
          <TrendChart
            label="Replies"
            color="var(--chart-2)"
            data={fillDays(
              daily,
              start,
              end,
              (d) => d.unique_replies + d.unique_replies_automatic,
            )}
          />
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-[13px] text-muted-foreground hover:text-foreground">
            Show the numbers per day
          </summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 text-right font-medium">Sent</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Leads contacted
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Replies</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Of which automatic
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...daily]
                  .filter((d) => d.date >= start && d.date <= end)
                  .sort((x, y) => y.date.localeCompare(x.date))
                  .map((d) => (
                    <tr key={d.date}>
                      <td className="px-3 py-1.5">{d.date}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {d.sent.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {d.contacted.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {(
                          d.unique_replies + d.unique_replies_automatic
                        ).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {d.unique_replies_automatic.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <h2 className="mt-6 mb-3 text-[15px] font-semibold">Step analytics</h2>
      {stepRows.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No emails sent in this period.
        </p>
      ) : (
        <TableFrame className="min-h-0">
          <table>
            <thead>
              <tr>
                <th className="px-4">Step</th>
                <th className="px-4 text-right">Sent</th>
                {campaign.open_tracking && (
                  <th className="px-4 text-right">Opened</th>
                )}
                <th className="px-4 text-right">Replied</th>
                <th className="px-4 text-right">Reply rate</th>
                <th className="px-4 text-right">Auto-replies</th>
                {campaign.link_tracking && (
                  <th className="px-4 text-right">Clicked</th>
                )}
                <th className="px-4 text-right">Opportunities</th>
                <th className="px-4 text-right">Meetings booked</th>
                <th className="px-4 text-right">Won</th>
              </tr>
            </thead>
            <tbody>
              {stepRows.flatMap(({ total, variants }) =>
                [total, ...variants].map((s, i) => (
                  <tr key={`${s.step}-${i === 0 ? "total" : s.variant}`}>
                    <td
                      className={cn(
                        "px-4 py-3",
                        i === 0 ? "font-medium" : "pl-8 text-muted-foreground",
                      )}
                    >
                      {i === 0
                        ? stepName(s)
                        : `Variant ${VARIANTS[Number(s.variant)] ?? s.variant}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.sent.toLocaleString()}
                    </td>
                    {campaign.open_tracking && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.unique_opened.toLocaleString()}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(
                        s.unique_replies + s.unique_replies_automatic
                      ).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {pct(
                        s.unique_replies + s.unique_replies_automatic,
                        s.sent,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {s.unique_replies_automatic.toLocaleString()}
                    </td>
                    {campaign.link_tracking && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.unique_clicks.toLocaleString()}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(s.opportunities ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(s.meetings_booked ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(s.won ?? 0).toLocaleString()}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </TableFrame>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";

import { TableFrame } from "@/components/app/data-table";
import { Button } from "@/components/ui/button";
import {
  JobProgress,
  type JobStatus,
  JobStatusBadge,
} from "@/components/app/job-status";
import { LiveRefresh } from "@/components/app/live-refresh";
import {
  type WorkerStatus,
  WorkerHealth,
} from "@/components/app/worker-health";
import {
  EmptyState,
  PageHeader,
  PageTabs,
  Panel,
} from "@/components/app/page-header";
import { requireWorkspace } from "@/lib/auth/workspace";
import { cachedJobStats, loadJobStats } from "@/lib/scraping-stats";
import { createClient } from "@/lib/supabase/server";

import { CancelJobButton, DiscoveryForm, NewJobForm } from "./job-controls";

export const metadata: Metadata = { title: "Scraping Jobs" };

/**
 * Must match SEARCH_MONTHLY_LIMIT in workers/.env (the worker enforces it).
 * 2,500 free Serper credits minus a reserve of 100.
 */
const SEARCH_MONTHLY_LIMIT = 2400;

type Job = {
  id: string;
  kind: "enrich_websites" | "discover";
  title: string;
  status: JobStatus;
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
  created_at: string;
};

const TABS = [
  { value: "", label: "Jobs" },
  { value: "find", label: "Find new agencies" },
  { value: "update", label: "Update agencies" },
] as const;

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function ScrapingJobsPage({ searchParams }: Props) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.value === tabParam) ? tabParam! : "";
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const month = new Date().toISOString().slice(0, 7) + "-01";

  const jobsQuery = supabase
    .from("scrape_jobs")
    .select(
      "id, kind, title, status, total_tasks, done_tasks, failed_tasks, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Job[]>()
    // A query runs each time it is awaited: run it once, use the result twice.
    .then((result) => result);

  const [{ data: jobs }, jobStats, { data: usage }, { data: workers }] =
    await Promise.all([
      jobsQuery,
      cachedJobStats(
        workspaceId,
        jobsQuery.then(({ data }) => data ?? []),
        () => loadJobStats(supabase, workspaceId),
      ),
      supabase
        .from("search_usage")
        .select("used")
        .eq("provider", "serper")
        .eq("month", month)
        .maybeSingle<{ used: number }>(),
      supabase
        .from("worker_status")
        .select(
          "worker_id, state, updated_at, concurrency, running, tasks_per_minute, loop_lag_ms, oldest_task_seconds, restarts",
        )
        .order("updated_at", { ascending: false })
        .limit(20)
        .returns<WorkerStatus[]>(),
    ]);

  const { linkSites } = jobStats;
  const rankedCountries = jobStats.ranking;
  const stats = new Map(jobStats.stats.map((s) => [s.job_id, s]));

  return (
    <>
      <PageHeader
        title="Scraping Jobs"
        tabs={
          <PageTabs
            label="Scraping jobs"
            tabs={TABS.map((t) => ({
              label: t.label,
              href: t.value
                ? `/scraping-jobs?tab=${t.value}`
                : "/scraping-jobs",
              active: tab === t.value,
              count: t.value === "" ? (jobs?.length ?? 0) : undefined,
            }))}
          />
        }
        actions={
          <>
            <LiveRefresh kinds={["jobs", "workers"]} />
            {tab === "" && (
              <Button asChild>
                <Link href="/scraping-jobs?tab=find">
                  <Plus /> New job
                </Link>
              </Button>
            )}
          </>
        }
      />

      <WorkerHealth statuses={workers ?? []} now={new Date().getTime()} />

      {tab === "find" && (
        <Panel
          title="Find new agencies"
          description="Every website found is checked against your database (no duplicates), visited, and rated for relevance. Only travel, event and ticketing businesses are added."
        >
          <DiscoveryForm
            searchUsed={usage?.used ?? 0}
            searchLimit={SEARCH_MONTHLY_LIMIT}
            linkSites={linkSites ?? 0}
            unsearchedCountries={rankedCountries
              .filter((r) => !r.searched)
              .map((r) => r.country_code)}
            searchedCountries={rankedCountries
              .filter((r) => r.searched)
              .map((r) => r.country_code)}
          />
        </Panel>
      )}

      {tab === "update" && (
        <Panel
          title="Update existing agencies"
          description="Visits each agency website (homepage and contact/about pages), respects robots.txt, fills empty fields and updates the relevance rating. Imported data is never overwritten."
        >
          <NewJobForm />
        </Panel>
      )}

      {tab === "" &&
        (!jobs?.length ? (
          <EmptyState
            title="No scraping jobs yet"
            text="Start your first job with New job."
          />
        ) : (
          <TableFrame>
            <table>
              <thead>
                <tr>
                  <th className="px-5">Job</th>
                  <th className="px-5">Status</th>
                  <th className="px-5">Progress</th>
                  <th className="px-5">Started</th>
                  <th className="px-5" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const active =
                    job.status === "queued" || job.status === "running";
                  const s = stats.get(job.id);
                  return (
                    <tr key={job.id} className="animate-in fade-in">
                      <td className="px-5 py-4">
                        <div className="font-medium">{job.title}</div>
                        {job.kind === "discover" && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            <Link
                              href="/agencies?sort=added.desc"
                              className="font-medium text-success hover:underline"
                            >
                              {Number(s?.accepted ?? 0).toLocaleString()} new
                              agencies
                            </Link>
                            {" · "}
                            {Number(s?.rejected ?? 0).toLocaleString()} not
                            relevant / unreachable
                            {Number(s?.pending ?? 0) > 0 &&
                              ` · ${Number(s?.pending).toLocaleString()} being checked`}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-4">
                        <JobProgress
                          done={job.done_tasks}
                          failed={job.failed_tasks}
                          total={job.total_tasks}
                          running={job.status === "running"}
                        />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                        {new Date(job.created_at).toLocaleString("en-GB", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {active && <CancelJobButton jobId={job.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableFrame>
        ))}
    </>
  );
}

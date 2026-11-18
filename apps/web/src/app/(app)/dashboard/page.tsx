import {
  Building2,
  Layers,
  type LucideIcon,
  Mail,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AnimatedNumber } from "@/components/app/animated-number";
import { TableFrame } from "@/components/app/data-table";
import {
  JobProgress,
  type JobStatus,
  JobStatusBadge,
} from "@/components/app/job-status";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

type Job = {
  id: string;
  title: string;
  status: JobStatus;
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
  created_at: string;
};

type Counts = {
  agencies: number;
  contacts: number;
  active_jobs: number;
  pending_users: number;
};

export default async function DashboardPage() {
  const { profile, workspaceId } = await requireWorkspace();
  const isAdmin = profile.platform_role === "admin";
  const firstName = (profile.full_name || profile.email).split(" ")[0];
  const supabase = await createClient();

  const [{ data: counts }, { data: exportSummary }, recent] = await Promise.all(
    [
      supabase
        .rpc("dashboard_counts", { p_workspace_id: workspaceId })
        .maybeSingle<Counts>(),
      supabase
        .rpc("contact_export_summary", { p_workspace_id: workspaceId })
        .maybeSingle<{ total: number; unused: number }>(),
      supabase
        .from("scrape_jobs")
        .select(
          "id, title, status, total_tasks, done_tasks, failed_tasks, created_at",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<Job[]>(),
    ],
  );
  const number = (n: number | string | null | undefined) => Number(n ?? 0);

  const stats: Stat[] = [
    {
      icon: Building2,
      label: "Total agencies",
      value: number(counts?.agencies),
      href: "/agencies",
    },
    {
      icon: Mail,
      label: "Email contacts",
      value: number(counts?.contacts),
      href: "/contacts",
    },
    {
      icon: Send,
      label: "Not exported yet",
      value: number(exportSummary?.unused),
      href: "/contacts",
      tone: "text-success",
    },
    {
      icon: Layers,
      label: "Active scraping jobs",
      value: number(counts?.active_jobs),
      href: "/scraping-jobs",
    },
    ...(isAdmin
      ? [
          {
            icon: ShieldCheck,
            label: "Pending approvals",
            value: number(counts?.pending_users),
            href: "/admin/users",
            tone: number(counts?.pending_users) ? "text-warning" : undefined,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${firstName}`}
        actions={
          <LiveRefresh
            tables={isAdmin ? ["scrape_jobs", "profiles"] : ["scrape_jobs"]}
            workspaceId={workspaceId}
            minIntervalMs={5000}
          />
        }
      />

      {/* One strip of numbers, as on Instantly's analytics page */}
      <div
        className={cn(
          "grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2",
          stats.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4",
        )}
      >
        {stats.map((stat) => (
          <StatCell key={stat.label} {...stat} />
        ))}
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Recent scraping jobs</h2>
          <Link
            href="/scraping-jobs"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        {!recent.data?.length ? (
          <EmptyState
            title="No scraping jobs yet"
            text="Start an enrichment job on the Scraping Jobs page."
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
                </tr>
              </thead>
              <tbody>
                {recent.data.map((job) => (
                  <tr key={job.id}>
                    <td className="px-5 py-3.5 font-medium">{job.title}</td>
                    <td className="px-5 py-3.5">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <JobProgress
                        done={job.done_tasks}
                        failed={job.failed_tasks}
                        total={job.total_tasks}
                        running={job.status === "running"}
                      />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
                      {new Date(job.created_at).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </section>
    </>
  );
}

type Stat = {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
  /** Color class for the number. */
  tone?: string;
};

function StatCell({ icon: Icon, label, value, href, tone }: Stat) {
  return (
    <Link
      href={href}
      className="group -mr-px -mb-px border-r border-b px-5 py-5 transition-colors hover:bg-accent/40"
    >
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-[28px] leading-none font-semibold tracking-tight",
          tone,
        )}
      >
        <AnimatedNumber value={value} />
      </p>
    </Link>
  );
}

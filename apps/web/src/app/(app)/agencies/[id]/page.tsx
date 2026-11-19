import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { RelevanceBadge } from "@/components/app/relevance-badge";
import { LevelBadge } from "@/components/app/level-badge";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { countryName } from "@/lib/countries";
import { agencyId } from "@/lib/instantly";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agency" };

const ORIGIN: Record<string, string> = {
  import: "Client import",
  osm: "OpenStreetMap",
  link: "Link on an agency website",
  search: "Web search",
  manual: "Added manually",
};

type Agency = {
  id: string;
  name: string;
  identity_key: string;
  website_url: string | null;
  website_title: string | null;
  website_status: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  last_checked_at: string | null;
  relevance: string | null;
  relevance_keywords: string[];
  agency_type: string | null;
  priority: number | null;
  ref: number;
  origin: string;
  created_at: string;
  agency_contacts: {
    id: string;
    email: string | null;
    full_name: string | null;
    job_title: string | null;
    is_role_address: boolean;
    source: string;
    email_original: string | null;
    email_status: string | null;
    email_note: string | null;
    email_levels: { level: number; blocked: string | null } | null;
  }[];
  agency_sources: {
    id: number;
    source_type: string;
    source_name: string;
    source_ref: string;
    observed_at: string;
  }[];
};

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export default async function AgencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  // RLS limits the agency to the user's workspace, so both load at the same time.
  const [{ workspaceId }, { data: agency }] = await Promise.all([
    requireWorkspace(),
    supabase
      .from("agencies")
      .select(
        "id, name, identity_key, website_url, website_title, website_status, country_code, country_name, city, address, phone, description, last_checked_at, created_at, relevance, relevance_keywords, agency_type, priority, ref, origin, agency_contacts(id, email, full_name, job_title, is_role_address, source, email_original, email_status, email_note, email_levels(level, blocked)), agency_sources(id, source_type, source_name, source_ref, observed_at)",
      )
      .eq("id", id)
      .maybeSingle<Agency>(),
  ]);
  if (!agency) notFound();

  const facts: [string, string | null][] = [
    ["Domain", agency.identity_key],
    ["Origin", ORIGIN[agency.origin] ?? agency.origin],
    ["Country", countryName(agency.country_code) ?? agency.country_name],
    ["City", agency.city],
    ["Address", agency.address],
    ["Phone", agency.phone],
    ["Website title", agency.website_title],
    ["Website status", agency.website_status],
    ["Last checked", date(agency.last_checked_at)],
    ["Added", date(agency.created_at)],
  ];

  return (
    <>
      <PageHeader
        title={agency.name}
        description={agency.ref ? agencyId(agency.ref) : undefined}
        back={{ href: "/agencies", label: "Back to agencies" }}
        actions={
          <>
            <LiveRefresh
              tables={["scrape_jobs"]}
              workspaceId={workspaceId}
              minIntervalMs={5000}
            />
            {agency.website_url && (
              <Button asChild variant="outline">
                <a
                  href={agency.website_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  Open website <ExternalLink />
                </a>
              </Button>
            )}
          </>
        }
      />

      {agency.description && (
        <p className="mb-4 max-w-4xl text-sm text-muted-foreground">
          {agency.description}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Details</h2>
          <div className="mb-5 rounded-md border bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">Relevance</p>
            <div className="mt-1">
              <RelevanceBadge
                level={agency.relevance}
                keywords={agency.relevance_keywords}
                showLabel
              />
            </div>
            {agency.relevance_keywords.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Matched: {agency.relevance_keywords.join(", ")}
              </p>
            )}
            {agency.agency_type && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">
                  Priority {agency.priority}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {agency.agency_type} · {agencyId(agency.ref)}
                </span>
              </p>
            )}
          </div>
          <dl className="divide-y text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-6 py-2.5">
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 text-right font-medium break-words">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
          <h2 className="mb-3 text-[15px] font-semibold">
            Contacts ({agency.agency_contacts.length})
          </h2>
          {agency.agency_contacts.length === 0 ? (
            <p className="text-muted-foreground">No contacts yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b text-[11px] tracking-wider uppercase">
                <tr>
                  <th className="py-2 font-semibold">Email</th>
                  <th className="py-2 font-semibold">Name</th>
                  <th className="py-2 font-semibold">Title</th>
                  <th className="py-2 font-semibold">Source</th>
                  <th className="py-2 font-semibold">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agency.agency_contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2">
                      {c.email}
                      {c.is_role_address && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (general)
                        </span>
                      )}
                      {c.email_status && c.email_status !== "valid" && (
                        <StatusBadge
                          tone={
                            c.email_status === "duplicate"
                              ? "neutral"
                              : c.email_status === "invalid"
                                ? "danger"
                                : "warning"
                          }
                          className="ml-2"
                        >
                          {c.email_status.replaceAll("_", " ")}
                        </StatusBadge>
                      )}
                      {(c.email_note || c.email_original) && (
                        <div className="text-xs text-muted-foreground">
                          {[
                            c.email_note,
                            c.email_original &&
                              `cleaned from “${c.email_original}”`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="py-2">{c.full_name ?? "—"}</td>
                    <td className="py-2">{c.job_title ?? "—"}</td>
                    <td className="py-2 capitalize">{c.source}</td>
                    <td className="py-2">
                      {c.email &&
                        (c.email_levels?.blocked ? (
                          <StatusBadge tone="danger" className="normal-case">
                            {c.email_levels.blocked === "bounced"
                              ? "Bounced"
                              : "Unsubscribed"}
                          </StatusBadge>
                        ) : (
                          <LevelBadge level={c.email_levels?.level ?? 0} />
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="mt-8 mb-3 text-[15px] font-semibold">
            Sources ({agency.agency_sources.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {agency.agency_sources.map((s) => (
              <li
                key={s.id}
                className="rounded-md border bg-muted/50 px-3 py-2"
              >
                <span className="font-medium capitalize">{s.source_type}</span>{" "}
                · {s.source_name}
                <div className="text-xs break-all text-muted-foreground">
                  {s.source_ref} · {date(s.observed_at)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

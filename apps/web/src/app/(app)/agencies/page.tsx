import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  ActiveFilters,
  CountriesFilter,
  QuickViews,
  TopicsFilter,
} from "@/components/app/agency-filters";
import {
  FilterSelect,
  Pagination,
  SearchInput,
  SortHeader,
  TableFrame,
} from "@/components/app/data-table";
import { ExportDialog } from "@/components/app/export-dialog";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, PageHeader, Toolbar } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { RelevanceBadge } from "@/components/app/relevance-badge";
import { hasFilters, parseFilters, queryAgencies } from "@/lib/agencies";
import { countryName } from "@/lib/countries";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agencies" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ORIGIN_LABEL: Record<string, string> = {
  osm: "via OpenStreetMap",
  link: "via agency link",
  search: "via web search",
  manual: "added manually",
};

const WEBSITE_STATUS: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  ok: { label: "Checked", tone: "success" },
  blocked: { label: "Blocked", tone: "warning" },
  unreachable: { label: "Offline", tone: "danger" },
  not_found: { label: "Not found", tone: "danger" },
  error: { label: "Error", tone: "danger" },
};

export default async function AgenciesPage({ searchParams }: Props) {
  const { workspaceId } = await requireWorkspace();
  const params = await searchParams;
  const filters = parseFilters(params);

  const supabase = await createClient();
  const [{ data: agencies, count, error }, countryResult] = await Promise.all([
    queryAgencies(workspaceId, filters, {
      limit: filters.size,
      offset: (filters.page - 1) * filters.size,
    }),
    supabase.rpc("agency_country_counts", { p_workspace_id: workspaceId }),
  ]);
  if (error) throw new Error(error.message);
  const countries = (countryResult.data ?? []) as {
    country_code: string | null;
    total: number;
  }[];

  const total = count ?? 0;
  const filtered = hasFilters(filters);

  return (
    <>
      <PageHeader
        title="Agencies"
        description={`${total.toLocaleString()}${filtered ? " matching" : ""}`}
        tabs={<QuickViews />}
        actions={
          <>
            <LiveRefresh
              tables={["scrape_jobs"]}
              workspaceId={workspaceId}
              minIntervalMs={10000}
            />
            <ExportDialog />
          </>
        }
      />

      <Toolbar>
        <SearchInput
          placeholder="Search name, website, email, city…"
          className="sm:w-72"
        />
        <CountriesFilter
          counts={Object.fromEntries(
            countries
              .filter((c) => c.country_code)
              .map((c) => [c.country_code as string, Number(c.total)]),
          )}
          unknown={Number(countries.find((c) => !c.country_code)?.total ?? 0)}
        />
        <TopicsFilter />
        <FilterSelect
          param="relevance"
          label="Relevance"
          options={[
            { value: "", label: "Any relevance" },
            { value: "abc", label: "Relevant (A–C)" },
            { value: "A", label: "A · Tickets & hospitality" },
            { value: "B", label: "B · Sports & event travel" },
            { value: "C", label: "C · Travel & concierge" },
            { value: "D", label: "D · Weak match" },
            { value: "E", label: "E · No match" },
            { value: "unrated", label: "Not rated yet" },
          ]}
        />
        <FilterSelect
          param="origin"
          label="Origin"
          options={[
            { value: "", label: "Any origin" },
            { value: "import", label: "Client import" },
            { value: "osm", label: "OpenStreetMap" },
            { value: "link", label: "Link on agency website" },
            { value: "search", label: "Web search" },
          ]}
        />
        <FilterSelect
          param="contact"
          label="Contact"
          options={[
            { value: "", label: "Any contact details" },
            { value: "email", label: "With email" },
            { value: "email_phone", label: "With email and phone" },
            { value: "phone", label: "With phone" },
            { value: "no_email", label: "Without email" },
          ]}
        />
        <FilterSelect
          param="added"
          label="Added"
          options={[
            { value: "", label: "Added any time" },
            { value: "1d", label: "Added today" },
            { value: "7d", label: "Added this week" },
            { value: "30d", label: "Added this month" },
          ]}
        />
        <FilterSelect
          param="status"
          label="Website"
          options={[
            { value: "", label: "Any website status" },
            { value: "ok", label: "Checked" },
            { value: "unchecked", label: "Not checked yet" },
            { value: "blocked", label: "Blocked" },
            { value: "dead", label: "Offline / not found" },
          ]}
        />
        <Pagination
          page={filters.page}
          pageSize={filters.size}
          total={total}
          className="ml-auto"
        />
      </Toolbar>
      <div className="mb-3 empty:hidden">
        <ActiveFilters />
      </div>

      {!agencies?.length ? (
        <EmptyState
          title="No agencies found"
          text={
            filtered
              ? "Try a different search or filter."
              : "Import data or run a scraping job."
          }
        />
      ) : (
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th className="px-4 py-3">
                  <SortHeader field="name" current={filters.sort}>
                    Agency
                  </SortHeader>
                </th>
                <th className="px-4 py-3">
                  <SortHeader field="country" current={filters.sort}>
                    Country
                  </SortHeader>
                </th>
                <th className="px-4 py-3">
                  <SortHeader field="relevance" current={filters.sort}>
                    Relevance
                  </SortHeader>
                </th>
                <th className="px-4">Services</th>
                <th className="px-4">Contact</th>
                <th className="px-4 py-3">
                  <SortHeader field="checked" current={filters.sort}>
                    Website
                  </SortHeader>
                </th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => {
                const emails = a.agency_contacts.filter((c) => c.email);
                const status = a.website_status
                  ? WEBSITE_STATUS[a.website_status]
                  : undefined;
                return (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/agencies/${a.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {a.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {a.identity_key}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {countryName(a.country_code) ?? a.country_name ?? "—"}
                      {a.city && (
                        <div className="text-xs text-muted-foreground">
                          {a.city}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RelevanceBadge
                        level={a.relevance}
                        keywords={a.relevance_keywords}
                      />
                      {a.agency_type && (
                        <div className="mt-1 text-xs whitespace-nowrap">
                          <span className="font-semibold">{`P${a.priority}`}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {a.agency_type}
                          </span>
                        </div>
                      )}
                      {a.origin !== "import" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {ORIGIN_LABEL[a.origin] ?? a.origin}
                        </div>
                      )}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-muted-foreground">
                      <span className="line-clamp-2">
                        {a.description ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {emails[0]?.email ?? "—"}
                      {emails.length > 1 && (
                        <span className="ml-1.5 rounded bg-accent px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                          +{emails.length - 1}
                        </span>
                      )}
                      {a.phone && (
                        <div className="text-xs whitespace-nowrap text-muted-foreground">
                          {a.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.website_url ? (
                        <a
                          href={a.website_url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
                        >
                          Visit <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        "—"
                      )}
                      {status && (
                        <div className="mt-1">
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        </div>
                      )}
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

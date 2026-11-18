import type { Metadata } from "next";
import Link from "next/link";

import { CountriesFilter } from "@/components/app/agency-filters";
import {
  FilterSelect,
  Pagination,
  SearchInput,
  TableFrame,
} from "@/components/app/data-table";
import { ExportButton } from "@/components/app/export-button";
import { LiveRefresh } from "@/components/app/live-refresh";
import {
  EmptyState,
  PageHeader,
  PageTabs,
  Toolbar,
} from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { requireWorkspace } from "@/lib/auth/workspace";
import {
  hasContactFilters,
  parseContactFilters,
  queryContacts,
} from "@/lib/contacts";
import { countryName } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts" };

type Contact = {
  id: string;
  email: string | null;
  full_name: string | null;
  job_title: string | null;
  is_role_address: boolean;
  source: string;
  email_original: string | null;
  email_status: EmailStatus | null;
  email_note: string | null;
  agencies: { id: string; name: string; country_code: string | null } | null;
};

type EmailStatus =
  "valid" | "unverified" | "no_mail_server" | "invalid" | "duplicate";

const STATUS_BADGE: Record<
  EmailStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  valid: { label: "valid", tone: "success" },
  unverified: { label: "not verified", tone: "warning" },
  no_mail_server: { label: "no mail server", tone: "warning" },
  invalid: { label: "invalid", tone: "danger" },
  duplicate: { label: "duplicate", tone: "neutral" },
};

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/** Current URL with some parameters changed (and the page reset). */
function hrefWith(
  params: Record<string, string | undefined>,
  changes: Record<string, string>,
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value && key !== "page") next.set(key, value);
  }
  const query = next.toString();
  return query ? `/contacts?${query}` : "/contacts";
}

export default async function ContactsPage({ searchParams }: Props) {
  const { workspaceId } = await requireWorkspace();
  const params = await searchParams;
  const filters = parseContactFilters(params);
  const { kind } = filters;
  const size = [25, 50, 100].includes(Number(params.size))
    ? Number(params.size)
    : 50;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createClient();
  const countsPromise = supabase.rpc("agency_country_counts", {
    p_workspace_id: workspaceId,
  });
  const { data: contacts, count } = await queryContacts(
    supabase,
    workspaceId,
    filters,
    "id, email, full_name, job_title, is_role_address, source, email_original, email_status, email_note",
    "id, name, country_code",
  )
    .range((page - 1) * size, page * size - 1)
    .returns<Contact[]>();
  const total = count ?? 0;
  const countryCounts = ((await countsPromise).data ?? []) as {
    country_code: string | null;
    total: number;
  }[];
  const filtered = hasContactFilters(filters);
  // The export takes the same filters as the list (not the page or page size).
  const exportQuery = new URLSearchParams(
    Object.entries(params).filter(
      (e): e is [string, string] =>
        Boolean(e[1]) && e[0] !== "page" && e[0] !== "size",
    ),
  ).toString();

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString()}${filtered ? " matching" : " valid emails"}`}
        tabs={
          <PageTabs
            label="Contact type"
            tabs={[
              { label: "All contacts", value: "" },
              { label: "Personal", value: "person" },
              { label: "General (info@…)", value: "general" },
            ].map((t) => ({
              label: t.label,
              href: hrefWith(params, { kind: t.value }),
              active: kind === t.value,
            }))}
          />
        }
        actions={
          <>
            <LiveRefresh
              tables={["scrape_jobs"]}
              workspaceId={workspaceId}
              minIntervalMs={10000}
            />
            <ExportButton
              href={`/contacts/export${exportQuery ? `?${exportQuery}` : ""}`}
              count={total}
            />
          </>
        }
      />

      <Toolbar>
        <SearchInput placeholder="Search email or name…" />
        <CountriesFilter
          counts={Object.fromEntries(
            countryCounts
              .filter((c) => c.country_code)
              .map((c) => [c.country_code as string, Number(c.total)]),
          )}
          unknown={0}
        />
        <FilterSelect
          param="relevance"
          label="Relevance"
          options={[
            { value: "", label: "Any agency" },
            { value: "abc", label: "Relevant agencies (A–C)" },
            { value: "A", label: "A · Tickets & hospitality" },
            { value: "B", label: "B · Sports & event travel" },
            { value: "C", label: "C · Travel & concierge" },
          ]}
        />
        <FilterSelect
          param="source"
          label="Source"
          options={[
            { value: "", label: "All sources" },
            { value: "import", label: "Client import" },
            { value: "website", label: "Agency website" },
          ]}
        />
        <Pagination
          page={page}
          pageSize={size}
          total={total}
          className="ml-auto"
        />
      </Toolbar>

      {!contacts?.length ? (
        <EmptyState
          title="No contacts found"
          text="Try a different search or filter."
        />
      ) : (
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th className="px-4">Email</th>
                <th className="px-4">Name</th>
                <th className="px-4">Title</th>
                <th className="px-4">Agency</th>
                <th className="px-4">Country</th>
                <th className="px-4">Source</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{c.email}</span>
                    {c.is_role_address && (
                      <StatusBadge tone="neutral" className="ml-2">
                        general
                      </StatusBadge>
                    )}
                    {c.email_status && c.email_status !== "valid" && (
                      <StatusBadge
                        tone={STATUS_BADGE[c.email_status].tone}
                        className="ml-2"
                      >
                        {STATUS_BADGE[c.email_status].label}
                      </StatusBadge>
                    )}
                    {c.email_note && c.email_status !== "valid" && (
                      <div className="text-xs text-muted-foreground">
                        {c.email_note}
                      </div>
                    )}
                    {c.email_original && (
                      <div className="text-xs text-muted-foreground">
                        cleaned from “{c.email_original}”
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.full_name ?? "—"}</td>
                  <td className="px-4 py-3">{c.job_title ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.agencies ? (
                      <Link
                        href={`/agencies/${c.agencies.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {c.agencies.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {countryName(c.agencies?.country_code) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      tone={c.source === "website" ? "info" : "neutral"}
                    >
                      {c.source === "website" ? "website" : "import"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
    </>
  );
}

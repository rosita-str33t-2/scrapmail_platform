import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Params = Record<string, string | string[] | undefined>;

export type ContactFilters = {
  q: string;
  source: "" | "import" | "website";
  kind: "" | "person" | "general";
  countries: string[];
  relevance: "" | "abc" | "A" | "B" | "C";
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Contact list filters from the URL (shared by the list and the CSV export). */
export function parseContactFilters(params: Params): ContactFilters {
  const source = first(params.source);
  const kind = first(params.kind);
  const relevance = first(params.relevance);
  return {
    q: first(params.q).trim().slice(0, 100),
    source: source === "import" || source === "website" ? source : "",
    kind: kind === "person" || kind === "general" ? kind : "",
    countries: [
      ...new Set(
        first(params.country)
          .split(",")
          .filter((c) => /^[A-Z]{2}$/.test(c)),
      ),
    ].slice(0, 250),
    relevance: (["abc", "A", "B", "C"] as const).includes(relevance as "abc")
      ? (relevance as ContactFilters["relevance"])
      : "",
  };
}

export function hasContactFilters(filters: ContactFilters) {
  return Boolean(
    filters.q ||
    filters.source ||
    filters.kind ||
    filters.countries.length ||
    filters.relevance,
  );
}

/**
 * Valid contacts matching the filters, sorted by email. `agencyColumns` are the
 * agency fields to embed; they are joined with !inner when an agency filter is set.
 */
export function queryContacts(
  supabase: Supabase,
  workspaceId: string,
  filters: ContactFilters,
  columns: string,
  agencyColumns: string,
  { count = true }: { count?: boolean } = {},
) {
  const byAgency = filters.countries.length > 0 || filters.relevance !== "";
  let query = supabase
    .from("agency_contacts")
    .select(
      `${columns}, agencies${byAgency ? "!inner" : ""}(${agencyColumns})`,
      count ? { count: "exact" } : undefined,
    )
    .eq("workspace_id", workspaceId);
  if (filters.countries.length)
    query = query.in("agencies.country_code", filters.countries);
  if (filters.relevance === "abc")
    query = query.in("agencies.relevance", ["A", "B", "C"]);
  else if (filters.relevance)
    query = query.eq("agencies.relevance", filters.relevance);

  const term = filters.q.replace(/[%,()*]/g, " ").trim();
  // Conditions where any part may match; combined with AND.
  const anyOf: string[] = [];
  if (term) anyOf.push(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  // Only valid addresses (and new ones not checked yet, e.g. from an import).
  anyOf.push("email_status.is.null,email_status.eq.valid");
  if (anyOf.length === 1) query = query.or(anyOf[0]!);
  else query = query.or(`and(${anyOf.map((g) => `or(${g})`).join(",")})`);

  if (filters.source) query = query.eq("source", filters.source);
  if (filters.kind === "person") query = query.eq("is_role_address", false);
  if (filters.kind === "general") query = query.eq("is_role_address", true);

  return query.order("email").order("id");
}

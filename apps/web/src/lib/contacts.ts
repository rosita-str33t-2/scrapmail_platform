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
  /** Export level: "0" never exported, "1", "2", "3+"; "" any. */
  level: "" | ExportLevel;
};

export const EXPORT_LEVELS = ["0", "1", "2", "3+"] as const;
export type ExportLevel = (typeof EXPORT_LEVELS)[number];

export function parseLevel(value: string | null | undefined): "" | ExportLevel {
  return (EXPORT_LEVELS as readonly string[]).includes(value ?? "")
    ? (value as ExportLevel)
    : "";
}

/** Level range of a level filter ("3+" has no upper end). */
export function levelRange(level: "" | ExportLevel) {
  if (!level) return { min: null, max: null };
  const n = Number.parseInt(level, 10);
  return { min: n, max: level.endsWith("+") ? null : n };
}

export function inLevel(value: number, level: "" | ExportLevel) {
  const { min, max } = levelRange(level);
  return (min === null || value >= min) && (max === null || value <= max);
}

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
    level: parseLevel(first(params.level)),
  };
}

export function hasContactFilters(filters: ContactFilters) {
  return Boolean(
    filters.q ||
    filters.source ||
    filters.kind ||
    filters.countries.length ||
    filters.relevance ||
    filters.level,
  );
}

/**
 * Valid contacts matching the filters. `agencyColumns` are the agency fields to
 * embed; they are joined with !inner when an agency filter is set. Reads the
 * contact_list view, which adds the address's `export_level`.
 *
 * order "email": A–Z (the list). "id": for reading everything page by page, each
 * page starting after `afterId` (the export sorts the rows itself, see `bestFirst`).
 */
export function queryContacts(
  supabase: Supabase,
  workspaceId: string,
  filters: ContactFilters,
  columns: string,
  agencyColumns: string,
  {
    count = true,
    order = "email",
    afterId,
  }: { count?: boolean; order?: "email" | "id"; afterId?: string } = {},
) {
  const byAgency = filters.countries.length > 0 || filters.relevance !== "";
  let query = supabase
    .from("contact_list")
    .select(
      `${columns}, export_level, agencies${byAgency ? "!inner" : ""}(${agencyColumns})`,
      count ? { count: "exact" } : undefined,
    )
    .eq("workspace_id", workspaceId);
  const { min, max } = levelRange(filters.level);
  if (min !== null) query = query.gte("export_level", min);
  if (max !== null) query = query.lte("export_level", max);
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

  if (afterId) query = query.gt("id", afterId);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.kind === "person") query = query.eq("is_role_address", false);
  if (filters.kind === "general") query = query.eq("is_role_address", true);

  return order === "id" ? query.order("id") : query.order("email").order("id");
}

const RELEVANCE_RANK: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };

/**
 * Export order: best agencies first (priority P1 → P4, then relevance A → E), a
 * person's address before a general one (info@ …), then A–Z.
 */
export function bestFirst<
  T extends {
    email: string | null;
    is_role_address: boolean;
    agencies: { priority: number | null; relevance: string | null } | null;
  },
>(a: T, b: T) {
  return (
    (a.agencies?.priority ?? 5) - (b.agencies?.priority ?? 5) ||
    (RELEVANCE_RANK[a.agencies?.relevance ?? ""] ?? 6) -
      (RELEVANCE_RANK[b.agencies?.relevance ?? ""] ?? 6) ||
    Number(a.is_role_address) - Number(b.is_role_address) ||
    (a.email ?? "").localeCompare(b.email ?? "")
  );
}

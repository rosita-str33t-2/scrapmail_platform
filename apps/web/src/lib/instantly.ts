import "server-only";

import { type ExportLevel, levelRange } from "@/lib/contacts";
import { countryName } from "@/lib/countries";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One exported email. */
export type ExportRow = {
  /** The contact the row comes from (its address goes up one level). */
  contact_id: string;
  email: string;
  full_name: string | null;
  company: string;
  website: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  agency_type: string | null;
  agency_ref: number | null;
};

/** Column order of Instantly's lead upload template. */
const HEADER = [
  "Email",
  "FirstName",
  "LastName",
  "CompanyName",
  "Website",
  "Country",
  "City",
  "AgencyType",
  "AgencyID",
];

const HONORIFIC =
  /^(mr|mrs|ms|miss|dr|prof|sir|mme|mlle|m|herr|frau|sr|sra|srta|sig|sig\.ra|dott)\.?$/i;

/** "Dr. Jane van Dijk" -> ["Jane", "van Dijk"]. */
export function splitName(fullName: string | null): [string, string] {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFIC.test(parts[0]!)) parts.shift();
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

export function agencyId(ref: number) {
  return `AGY-${String(ref).padStart(5, "0")}`;
}

function cell(value: string | null | undefined) {
  const text = (value ?? "").replace(/\r?\n/g, " ").trim();
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toInstantlyCsv(rows: ExportRow[]) {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    const [first, last] = splitName(r.full_name);
    lines.push(
      [
        r.email,
        first,
        last,
        r.company,
        r.website,
        countryName(r.country_code) ?? r.country_name,
        r.city,
        r.agency_type,
        r.agency_ref == null ? "" : agencyId(r.agency_ref),
      ]
        .map(cell)
        .join(","),
    );
  }
  // No byte-order mark: Instantly reads the first header as "Email" exactly.
  return `${lines.join("\r\n")}\r\n`;
}

/** Rows in this many API calls of 1,000 at most (100,000 emails). */
export const EXPORT_MAX_PAGES = 100;
export const EXPORT_PAGE_SIZE = 1000;
export const EXPORT_MAX_EMAILS = EXPORT_MAX_PAGES * EXPORT_PAGE_SIZE;

/** "?limit=500" -> 500; missing or invalid -> every email. */
export function exportLimit(value: string | null) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n > 0
    ? Math.min(n, EXPORT_MAX_EMAILS)
    : EXPORT_MAX_EMAILS;
}

/**
 * Collects rows for the CSV, each address once (the same email can belong to
 * several agencies; the first row for it is kept), up to `limit` emails.
 */
export function exportCollector(limit: number) {
  const seen = new Set<string>();
  const rows: ExportRow[] = [];
  return {
    rows,
    /** Adds the row unless its address is already in; true once the limit is reached. */
    add(row: ExportRow) {
      const key = row.email.toLowerCase();
      if (key && !seen.has(key) && rows.length < limit) {
        seen.add(key);
        rows.push(row);
      }
      return rows.length >= limit;
    },
    get full() {
      return rows.length >= limit;
    },
  };
}

/** CSV download in Instantly's format. */
export function csvResponse(rows: ExportRow[], name: string) {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toInstantlyCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${date}-${rows.length}.csv"`,
      "Cache-Control": "no-store",
      "X-Exported-Count": String(rows.length),
    },
  });
}

/**
 * Records the export (one batch), raises the level of its addresses by 1 and returns
 * the CSV. The database takes the rows again under a lock and skips any address that
 * is no longer within the level range (e.g. exported a moment ago by someone else),
 * so the same address can never be exported twice at the same level.
 */
export async function recordExport(
  supabase: Supabase,
  workspaceId: string,
  rows: ExportRow[],
  level: "" | ExportLevel,
  name: string,
) {
  if (rows.length === 0) {
    return new Response(
      level
        ? "No emails left at this level for the current filters."
        : "No emails match the current filters.",
      { status: 409 },
    );
  }
  const { min, max } = levelRange(level);
  const { data, error } = await supabase.rpc("record_contact_export", {
    p_workspace_id: workspaceId,
    p_contact_ids: rows.map((r) => r.contact_id),
    p_level_min: min,
    p_level_max: max,
  });
  if (error) {
    console.error("recording the export failed:", error.message);
    return new Response("The export failed. Please try again.", {
      status: 500,
    });
  }
  const taken = new Set((data as { contact_ids: string[] }).contact_ids);
  const exported = rows.filter((r) => taken.has(r.contact_id));
  if (exported.length === 0) {
    return new Response(
      "These emails were just exported by someone else. Please try again.",
      { status: 409 },
    );
  }
  return csvResponse(exported, name);
}

import "server-only";

import { countryName } from "@/lib/countries";
/** One exported email. */
export type ExportRow = {
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

/**
 * CSV download in Instantly's format. Each address appears once (the same email
 * can belong to several agencies); the first row for it is kept.
 */
export function csvResponse(rows: ExportRow[], name: string) {
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toInstantlyCsv(unique), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${date}-${unique.length}.csv"`,
      "Cache-Control": "no-store",
      "X-Exported-Count": String(unique.length),
    },
  });
}

import "server-only";

import { countryName } from "@/lib/countries";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One exported email (public.contact_export_rows). */
type ExportRow = {
  email: string;
  full_name: string | null;
  company: string;
  website: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  agency_type: string | null;
  agency_ref: number;
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
        agencyId(r.agency_ref),
      ]
        .map(cell)
        .join(","),
    );
  }
  // No byte-order mark: Instantly reads the first header as "Email" exactly.
  return `${lines.join("\r\n")}\r\n`;
}

/** CSV download of an export batch (members of its workspace only). */
export async function batchCsvResponse(
  supabase: Supabase,
  batchId: string,
  createdAt: string,
) {
  const { data, error } = await supabase.rpc("contact_export_rows", {
    p_batch_id: batchId,
  });
  if (error) return new Response(error.message, { status: 404 });
  const rows = (data ?? []) as ExportRow[];
  const date = createdAt.slice(0, 10);
  return new Response(toInstantlyCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="instantly-leads-${date}-${rows.length}.csv"`,
      "Cache-Control": "no-store",
      "X-Exported-Count": String(rows.length),
    },
  });
}

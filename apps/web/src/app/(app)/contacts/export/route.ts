import type { NextRequest } from "next/server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { bestFirst, parseContactFilters, queryContacts } from "@/lib/contacts";
import {
  EXPORT_MAX_PAGES,
  EXPORT_PAGE_SIZE,
  exportCollector,
  exportLimit,
  recordExport,
} from "@/lib/instantly";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_role_address: boolean;
  agencies: {
    name: string;
    website_url: string | null;
    country_code: string | null;
    country_name: string | null;
    city: string | null;
    agency_type: string | null;
    ref: number | null;
    priority: number | null;
    relevance: string | null;
  } | null;
};

/**
 * The contacts that match the list filters (including the level filter), best
 * agencies first, as an Instantly CSV. "limit" caps the number of emails. The
 * exported addresses go up one level.
 */
export async function GET(request: NextRequest) {
  const { workspaceId } = await requireWorkspace();
  const filters = parseContactFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const supabase = await createClient();

  // Every matching contact (pages by id, each after the last id), then sorted
  // best first.
  const all: Row[] = [];
  for (let n = 0; n < EXPORT_MAX_PAGES; n++) {
    const { data, error } = await queryContacts(
      supabase,
      workspaceId,
      filters,
      "id, email, full_name, is_role_address",
      "name, website_url, country_code, country_name, city, agency_type, ref, priority, relevance",
      { count: false, order: "id", afterId: all.at(-1)?.id },
    )
      .limit(EXPORT_PAGE_SIZE)
      .returns<Row[]>();
    if (error) {
      console.error("contacts export failed:", error.message);
      return new Response("The export failed. Please try again.", {
        status: 500,
      });
    }
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < EXPORT_PAGE_SIZE) break;
  }
  all.sort(bestFirst);

  const out = exportCollector(
    exportLimit(request.nextUrl.searchParams.get("limit")),
  );
  for (const c of all) {
    if (!c.email) continue;
    if (
      out.add({
        contact_id: c.id,
        email: c.email.trim(),
        full_name: c.full_name,
        company: c.agencies?.name ?? "",
        website: c.agencies?.website_url ?? null,
        country_code: c.agencies?.country_code ?? null,
        country_name: c.agencies?.country_name ?? null,
        city: c.agencies?.city ?? null,
        agency_type: c.agencies?.agency_type ?? null,
        agency_ref: c.agencies?.ref ?? null,
      })
    )
      break;
  }

  return recordExport(
    supabase,
    workspaceId,
    out.rows,
    filters.level,
    "instantly-contacts",
  );
}

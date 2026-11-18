import type { NextRequest } from "next/server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { parseContactFilters, queryContacts } from "@/lib/contacts";
import {
  csvResponse,
  EXPORT_MAX_PAGES,
  EXPORT_PAGE_SIZE,
  exportCollector,
  exportLimit,
} from "@/lib/instantly";
import { createClient } from "@/lib/supabase/server";

type Row = {
  email: string | null;
  full_name: string | null;
  agencies: {
    name: string;
    website_url: string | null;
    country_code: string | null;
    country_name: string | null;
    city: string | null;
    agency_type: string | null;
    ref: number | null;
  } | null;
};

/** Every contact that matches the list filters, as an Instantly CSV. */
export async function GET(request: NextRequest) {
  const { workspaceId } = await requireWorkspace();
  const filters = parseContactFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const supabase = await createClient();

  // "limit": how many emails to export (the first ones of the list); all if not set.
  const out = exportCollector(
    exportLimit(request.nextUrl.searchParams.get("limit")),
  );
  for (let page = 0; page < EXPORT_MAX_PAGES && !out.full; page++) {
    const { data, error } = await queryContacts(
      supabase,
      workspaceId,
      filters,
      "email, full_name",
      "name, website_url, country_code, country_name, city, agency_type, ref",
      { count: false },
    )
      .range(page * EXPORT_PAGE_SIZE, (page + 1) * EXPORT_PAGE_SIZE - 1)
      .returns<Row[]>();
    if (error) {
      return new Response("The export failed. Please try again.", {
        status: 500,
      });
    }
    for (const c of data ?? []) {
      if (!c.email) continue;
      out.add({
        email: c.email.trim(),
        full_name: c.full_name,
        company: c.agencies?.name ?? "",
        website: c.agencies?.website_url ?? null,
        country_code: c.agencies?.country_code ?? null,
        country_name: c.agencies?.country_name ?? null,
        city: c.agencies?.city ?? null,
        agency_type: c.agencies?.agency_type ?? null,
        agency_ref: c.agencies?.ref ?? null,
      });
    }
    if ((data?.length ?? 0) < EXPORT_PAGE_SIZE) break;
  }

  return csvResponse(out.rows, "instantly-contacts");
}

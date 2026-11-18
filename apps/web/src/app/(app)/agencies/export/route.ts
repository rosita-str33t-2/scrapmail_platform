import type { NextRequest } from "next/server";

import { parseFilters, queryAgencies } from "@/lib/agencies";
import { requireWorkspace } from "@/lib/auth/workspace";
import {
  csvResponse,
  EXPORT_MAX_PAGES,
  EXPORT_PAGE_SIZE,
  type ExportRow,
} from "@/lib/instantly";

/** The emails of every agency that matches the list filters, as an Instantly CSV. */
export async function GET(request: NextRequest) {
  const { workspaceId } = await requireWorkspace();
  const filters = parseFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  const rows: ExportRow[] = [];
  for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
    const { data, error } = await queryAgencies(workspaceId, filters, {
      limit: EXPORT_PAGE_SIZE,
      offset: page * EXPORT_PAGE_SIZE,
      contactColumns: "email, full_name",
      count: false,
    });
    if (error) {
      return new Response("The export failed. Please try again.", {
        status: 500,
      });
    }
    for (const a of data ?? []) {
      for (const c of a.agency_contacts) {
        if (!c.email) continue;
        rows.push({
          email: c.email.trim(),
          full_name: c.full_name ?? null,
          company: a.name,
          website: a.website_url,
          country_code: a.country_code,
          country_name: a.country_name,
          city: a.city,
          agency_type: a.agency_type,
          agency_ref: a.ref,
        });
      }
    }
    if ((data?.length ?? 0) < EXPORT_PAGE_SIZE) break;
  }

  return csvResponse(rows, "instantly-agencies");
}

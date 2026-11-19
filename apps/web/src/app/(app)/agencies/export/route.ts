import type { NextRequest } from "next/server";

import { parseFilters, queryAgencies } from "@/lib/agencies";
import { requireWorkspace } from "@/lib/auth/workspace";
import { inLevel, parseLevel } from "@/lib/contacts";
import {
  EXPORT_MAX_PAGES,
  EXPORT_PAGE_SIZE,
  exportCollector,
  exportLimit,
  recordExport,
} from "@/lib/instantly";
import { createClient } from "@/lib/supabase/server";

/**
 * The emails of every agency that matches the list filters, best agencies first, as
 * an Instantly CSV. "level" keeps only emails at that export level, "limit" caps the
 * number of emails. The exported addresses go up one level.
 */
export async function GET(request: NextRequest) {
  const { workspaceId } = await requireWorkspace();
  const params = request.nextUrl.searchParams;
  const filters = {
    ...parseFilters(Object.fromEntries(params)),
    sort: { field: "priority", dir: "asc" } as const,
  };
  const level = parseLevel(params.get("level"));

  // "limit": how many emails to export (the first ones of the list); all if not set.
  const out = exportCollector(exportLimit(params.get("limit")));
  for (let page = 0; page < EXPORT_MAX_PAGES && !out.full; page++) {
    const { data, error } = await queryAgencies(workspaceId, filters, {
      limit: EXPORT_PAGE_SIZE,
      offset: page * EXPORT_PAGE_SIZE,
      contactColumns: "id, email, full_name, email_levels(level, blocked)",
      count: false,
    });
    if (error) {
      console.error("agencies export failed:", error.message);
      return new Response("The export failed. Please try again.", {
        status: 500,
      });
    }
    for (const a of data ?? []) {
      for (const c of a.agency_contacts) {
        if (!c.email || !c.id || c.email_levels?.blocked) continue;
        if (level && !inLevel(c.email_levels?.level ?? 0, level)) continue;
        out.add({
          contact_id: c.id,
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

  return recordExport(
    await createClient(),
    workspaceId,
    out.rows,
    level,
    "instantly-agencies",
  );
}

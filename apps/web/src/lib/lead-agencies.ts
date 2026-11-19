import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The agency each lead address belongs to in our database (first match). */
export async function agenciesForEmails(
  supabase: Supabase,
  workspaceId: string,
  emails: string[],
) {
  const unique = [...new Set(emails.filter(Boolean))];
  const map = new Map<string, { id: string; name: string }>();
  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await supabase
      .from("agency_contacts")
      .select("email_normalized, agencies(id, name)")
      .eq("workspace_id", workspaceId)
      .in("email_normalized", unique.slice(i, i + 100))
      .returns<
        {
          email_normalized: string;
          agencies: { id: string; name: string } | null;
        }[]
      >();
    for (const row of data ?? []) {
      if (row.agencies && !map.has(row.email_normalized)) {
        map.set(row.email_normalized, row.agencies);
      }
    }
  }
  return map;
}

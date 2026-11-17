import type { NextRequest } from "next/server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { batchCsvResponse } from "@/lib/instantly";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

/** Download an earlier export again (same emails, nothing is marked). */
export async function GET(_request: NextRequest, { params }: Context) {
  const { workspaceId } = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Export not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("contact_exports")
    .select("id, created_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle<{ id: string; created_at: string }>();
  if (!batch) return new Response("Export not found", { status: 404 });

  return batchCsvResponse(supabase, batch.id, batch.created_at);
}

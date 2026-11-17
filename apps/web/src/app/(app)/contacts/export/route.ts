import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireWorkspace } from "@/lib/auth/workspace";
import { batchCsvResponse } from "@/lib/instantly";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  count: z.coerce.number().int().min(1).max(100_000),
});

/**
 * Export the next N best unused emails as an Instantly CSV. The emails are marked
 * as exported in the same database call, so the next export skips them.
 * Independent of any list filters.
 */
export async function POST(request: NextRequest) {
  const { workspaceId } = await requireWorkspace();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Enter a number of emails between 1 and 100,000.", {
      status: 400,
    });
  }

  const supabase = await createClient();
  const { data: batchId, error } = await supabase.rpc("export_contacts", {
    p_workspace_id: workspaceId,
    p_count: parsed.data.count,
  });
  if (error || !batchId) {
    const nothingLeft = error?.code === "P0002";
    return new Response(
      nothingLeft
        ? "All emails have already been exported. Reset the exports to start again."
        : "The export failed. Please try again.",
      { status: nothingLeft ? 409 : 500 },
    );
  }
  return batchCsvResponse(
    supabase,
    batchId as string,
    new Date().toISOString(),
  );
}

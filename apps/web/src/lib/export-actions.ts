"use server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type ExportBatch = {
  id: string;
  created_at: string;
  exported: number;
  cleared_at: string | null;
};

export type ExportSummary = {
  total: number;
  unused: number;
  batches: ExportBatch[];
};

/** Counts and recent exports for the export dialog (loaded when it opens). */
export async function getExportSummary(): Promise<ExportSummary> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const [summary, batches] = await Promise.all([
    supabase
      .rpc("contact_export_summary", { p_workspace_id: workspaceId })
      .maybeSingle<{ total: number; unused: number }>(),
    supabase
      .from("contact_exports")
      .select("id, created_at, exported, cleared_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<ExportBatch[]>(),
  ]);
  if (summary.error) throw new Error(summary.error.message);
  return {
    total: Number(summary.data?.total ?? 0),
    unused: Number(summary.data?.unused ?? 0),
    batches: batches.data ?? [],
  };
}

/** Mark every email as unused again (export history is kept). */
export async function resetExports(): Promise<ExportSummary> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_contact_exports", {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  return getExportSummary();
}

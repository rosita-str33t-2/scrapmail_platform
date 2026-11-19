"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type LevelState = {
  /** Addresses exported at least once (level 1 or higher). */
  raised: number;
  /** The most recent export that can still be undone. */
  lastExport: { id: string; exported: number; created_at: string } | null;
};

/** Shown in the export panel (loaded when it opens). */
export async function getLevelState(): Promise<LevelState> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const [raised, last] = await Promise.all([
    supabase
      .from("email_levels")
      .select("email_normalized", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gt("level", 0),
    supabase
      .from("contact_exports")
      .select("id, exported, created_at")
      .eq("workspace_id", workspaceId)
      .is("cleared_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; exported: number; created_at: string }>(),
  ]);
  if (raised.error) throw new Error(raised.error.message);
  return { raised: raised.count ?? 0, lastExport: last.data ?? null };
}

function refreshLists() {
  revalidatePath("/contacts");
  revalidatePath("/agencies");
}

/** The emails of the most recent export go down one level. */
export async function undoLastExport(): Promise<LevelState> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_last_contact_export", {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  refreshLists();
  return getLevelState();
}

/** Every email back to level 0. */
export async function resetAllLevels(): Promise<LevelState> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_email_levels", {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  refreshLists();
  return getLevelState();
}

import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { remembered } from "./account-cache";
import { getUserId, requireApprovedProfile } from "./session";

type Membership = {
  workspace_id: string;
  role: string;
  workspaces: { name: string } | null;
};

/** First workspace membership of the user (RLS returns it only when approved). */
const getMembership = cache((userId: string) =>
  remembered(`membership:${userId}`, () => loadMembership(userId)),
);

async function loadMembership(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle<Membership>();
  return data;
}

/** The signed-in user's workspace id, or null (no redirect; for the app shell). */
export const getWorkspaceId = cache(async (): Promise<string | null> => {
  const userId = await getUserId();
  if (!userId) return null;
  return (await getMembership(userId))?.workspace_id ?? null;
});

/**
 * Exporting emails is for platform administrators only (also enforced in the
 * database). Returns the workspace, or a 403 response for everyone else.
 */
export async function requireExportAdmin() {
  const workspace = await requireWorkspace();
  if (workspace.profile.platform_role !== "admin") {
    return {
      denied: new Response("Only administrators can export emails.", {
        status: 403,
      }),
    } as const;
  }
  return { denied: null, ...workspace } as const;
}

/** The signed-in user's workspace (first membership). */
export const requireWorkspace = cache(async () => {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  // Profile and membership are loaded at the same time (one round trip, not two).
  const [profile, data] = await Promise.all([
    requireApprovedProfile(),
    getMembership(userId),
  ]);

  if (!data) redirect("/pending");
  return {
    profile,
    workspaceId: data.workspace_id,
    workspaceName: data.workspaces?.name ?? "Workspace",
    role: data.role,
  };
});

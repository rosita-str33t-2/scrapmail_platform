import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { signOut } from "@/lib/auth/actions";
import { requireApprovedProfile } from "@/lib/auth/session";
import { getWorkspaceId } from "@/lib/auth/workspace";

/** Shell for all signed-in pages: approved accounts only. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Both at once (one round trip); the page reuses them (cached per request).
  const [profile, workspaceId] = await Promise.all([
    requireApprovedProfile(),
    getWorkspaceId(),
  ]);

  return (
    <AppShell
      displayName={profile.full_name || profile.email}
      email={profile.email}
      isAdmin={profile.platform_role === "admin"}
      workspaceId={workspaceId}
      signOut={signOut}
    >
      {children}
    </AppShell>
  );
}

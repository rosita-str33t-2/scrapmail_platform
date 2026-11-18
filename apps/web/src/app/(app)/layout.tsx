import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { signOut } from "@/lib/auth/actions";
import { requireApprovedProfile } from "@/lib/auth/session";

/** Shell for all signed-in pages: approved accounts only. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireApprovedProfile();

  return (
    <AppShell
      displayName={profile.full_name || profile.email}
      email={profile.email}
      isAdmin={profile.platform_role === "admin"}
      signOut={signOut}
    >
      {children}
    </AppShell>
  );
}

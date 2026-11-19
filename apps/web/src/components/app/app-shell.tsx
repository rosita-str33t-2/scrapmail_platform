"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Tooltip } from "radix-ui";
import { type ReactNode, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

import { LiveUpdatesProvider } from "./live-updates";
import { DrawerNav, RailNav, RailTooltip } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

type AppShellProps = {
  children: ReactNode;
  displayName: string;
  email: string;
  isAdmin: boolean;
  /** For the live updates of the workspace's data. */
  workspaceId: string | null;
  signOut: () => Promise<void>;
};

/**
 * Layout of the signed-in app, modelled on Instantly: a narrow icon rail on the
 * left (labels in tooltips) and a top bar drawn by each page (PageHeader).
 * On phones the rail becomes a drawer opened from a small top bar.
 */
export function AppShell({
  children,
  displayName,
  email,
  isAdmin,
  workspaceId,
  signOut,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <LiveUpdatesProvider workspaceId={workspaceId}>
      <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
        <div className="min-h-dvh md:pl-12">
          {/* Desktop icon rail */}
          <aside className="fixed inset-y-0 left-0 z-40 hidden w-12 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 md:flex">
            <RailTooltip label="Scrap&Mail">
              <Link
                href="/dashboard"
                aria-label="Scrap&Mail home"
                className="flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Logo markOnly size="sm" />
              </Link>
            </RailTooltip>
            <RailNav isAdmin={isAdmin} />
            <div className="mt-auto">
              <UserMenu
                displayName={displayName}
                email={email}
                signOut={signOut}
              />
            </div>
          </aside>

          {/* Mobile top bar */}
          <div className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <Logo size="sm" />
            <div className="ml-auto">
              <UserMenu
                displayName={displayName}
                email={email}
                signOut={signOut}
                side="bottom"
              />
            </div>
          </div>

          {/* Mobile drawer */}
          <div
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 md:hidden",
              mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
          <aside
            aria-label="Menu"
            inert={!mobileOpen}
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border bg-sidebar p-4 transition-transform duration-200 ease-out md:hidden",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between">
              <Logo size="sm" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <DrawerNav
              isAdmin={isAdmin}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>

          <main className="min-w-0 px-4 pb-10 md:px-6">{children}</main>
        </div>
      </Tooltip.Provider>
    </LiveUpdatesProvider>
  );
}

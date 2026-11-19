"use client";

import {
  Building2,
  FileText,
  LayoutGrid,
  Layers,
  Send,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { RepliesBadge } from "./replies-badge";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  /** Shows the number of new replies on the item. */
  repliesBadge?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/agencies", label: "Agencies", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/scraping-jobs", label: "Scraping Jobs", icon: Layers },
  {
    href: "/campaigns",
    label: "Email Campaigns",
    icon: Send,
    repliesBadge: true,
  },
  { href: "#", label: "Templates", icon: FileText, soon: true },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "User management", icon: ShieldCheck },
];

function isActive(pathname: string, item: NavItem) {
  return (
    !item.soon &&
    (pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
}

/** Label shown to the right of a rail icon on hover or keyboard focus. */
export function RailTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={10}
          className="z-50 rounded-md border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:slide-in-from-left-1 data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Icon-only navigation rail (desktop), as in the Instantly app. */
export function RailNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(pathname, item);
    const base =
      "flex size-8 items-center justify-center rounded-md transition-colors duration-150";

    if (item.soon) {
      return (
        <li key={item.label}>
          <RailTooltip label={`${item.label} · coming soon`}>
            <span
              tabIndex={0}
              aria-disabled="true"
              aria-label={`${item.label} (coming soon)`}
              className={cn(base, "text-sidebar-foreground/40 outline-none")}
            >
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </span>
          </RailTooltip>
        </li>
      );
    }

    return (
      <li key={item.label}>
        <RailTooltip label={item.label}>
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              base,
              "relative outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={1.75} />
            {item.repliesBadge && (
              <RepliesBadge className="absolute -top-1.5 -right-1.5" />
            )}
          </Link>
        </RailTooltip>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="mt-5 flex flex-col items-center gap-4">
      <ul className="flex flex-col items-center gap-1.5">
        {NAV.map(renderItem)}
      </ul>
      {isAdmin && (
        <>
          <span aria-hidden="true" className="h-px w-6 bg-sidebar-border" />
          <ul className="flex flex-col items-center gap-1.5">
            {ADMIN_NAV.map(renderItem)}
          </ul>
        </>
      )}
    </nav>
  );
}

/** Navigation with labels, for the mobile drawer. */
export function DrawerNav({
  isAdmin,
  onNavigate,
}: {
  isAdmin: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(pathname, item);
    const base =
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors";
    if (item.soon) {
      return (
        <li key={item.label}>
          <span
            aria-disabled="true"
            className={cn(base, "text-sidebar-foreground/50")}
          >
            <Icon className="size-[18px]" strokeWidth={1.75} />
            {item.label}
            <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[11px]">
              Soon
            </span>
          </span>
        </li>
      );
    }
    return (
      <li key={item.label}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            base,
            active
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60",
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.75} />
          {item.label}
          {item.repliesBadge && <RepliesBadge className="ml-auto" />}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main menu" className="mt-6 space-y-5">
      <ul className="space-y-0.5">{NAV.map(renderItem)}</ul>
      {isAdmin && (
        <div className="border-t border-sidebar-border pt-4">
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Administration
          </p>
          <ul className="space-y-0.5">{ADMIN_NAV.map(renderItem)}</ul>
        </div>
      )}
    </nav>
  );
}

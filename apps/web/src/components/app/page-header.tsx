import { ArrowLeft, Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { HoverPrefetchLink } from "./hover-prefetch-link";

/**
 * The page's top bar, as in Instantly: title on the left, a divider, optional
 * tabs, and the page actions on the right. Sticks to the top while scrolling.
 */
export function PageHeader({
  title,
  description,
  back,
  tabs,
  actions,
}: {
  title: ReactNode;
  /** Short muted text next to the title (e.g. a count). */
  description?: ReactNode;
  /** Back arrow before the title. */
  back?: { href: string; label: string };
  /** A <PageTabs> (or any tab strip) shown after the title. */
  tabs?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-12 z-30 -mx-4 mb-4 flex min-h-[62px] flex-wrap items-stretch border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:top-0 md:-mx-6 md:px-6">
      <div
        className={cn(
          "flex min-w-0 items-center gap-2.5 py-3",
          tabs && "md:min-w-56 md:border-r md:pr-6",
        )}
      >
        {back && (
          <Link
            href={back.href}
            aria-label={back.label}
            title={back.label}
            className="-ml-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <span className="hidden truncate text-[13px] text-muted-foreground sm:inline">
            {description}
          </span>
        )}
      </div>
      {tabs && (
        <div className="order-last -mx-4 flex w-[calc(100%+2rem)] min-w-0 border-t px-4 md:order-none md:mx-0 md:w-auto md:flex-1 md:border-t-0 md:px-6">
          {tabs}
        </div>
      )}
      {actions && (
        <div className="ml-auto flex flex-wrap items-center gap-2 py-3 pl-4">
          {actions}
        </div>
      )}
    </div>
  );
}

export type PageTab = {
  label: string;
  href: string;
  active: boolean;
  /** Small number after the label. */
  count?: number;
};

/** Link tabs with Instantly's blue underline on the active one. */
export function PageTabs({ tabs, label }: { tabs: PageTab[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="-mb-px flex [scrollbar-width:none] gap-6 overflow-x-auto"
    >
      {tabs.map((tab) => (
        <HoverPrefetchLink
          key={tab.label}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={tabClass(tab.active)}
        >
          {tab.label}
          {tab.count !== undefined && <TabCount value={tab.count} />}
        </HoverPrefetchLink>
      ))}
    </nav>
  );
}

export function tabClass(active: boolean) {
  return cn(
    "relative flex shrink-0 items-center gap-1.5 py-3 text-sm whitespace-nowrap transition-colors",
    "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
    active
      ? "font-medium text-foreground after:bg-primary"
      : "text-muted-foreground after:bg-transparent hover:text-foreground",
  );
}

export function TabCount({ value }: { value: number }) {
  return (
    <span className="rounded bg-accent px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums">
      {value.toLocaleString()}
    </span>
  );
}

/** Row with search and filters above a table. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

/** Bordered panel used for forms and side content. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border bg-card px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-accent">
        <Inbox className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

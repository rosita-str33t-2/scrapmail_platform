"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  type DropdownOption,
  DropdownSelect,
} from "@/components/ui/dropdown-select";
import { cn } from "@/lib/utils";

import { useUrlParams } from "./use-url-params";

/** Search box that updates the URL as you type (debounced). */
export function SearchInput({
  placeholder,
  param = "q",
  className,
}: {
  placeholder: string;
  param?: string;
  className?: string;
}) {
  const { searchParams, setParams, pending } = useUrlParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const update = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setParams({ [param]: next.trim() || null }),
      350,
    );
  };

  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => update(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-input bg-muted pr-8 pl-9 text-sm transition-colors outline-none placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {pending ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value && (
          <button
            type="button"
            onClick={() => update("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )
      )}
    </div>
  );
}

/** Dropdown that applies its value to the URL immediately. */
export function FilterSelect({
  param,
  label,
  options,
  className,
}: {
  param: string;
  label: string;
  options: DropdownOption[];
  className?: string;
}) {
  const { searchParams, setParams } = useUrlParams();
  return (
    <DropdownSelect
      label={label}
      value={searchParams.get(param) ?? ""}
      onValueChange={(value) => setParams({ [param]: value || null })}
      options={options}
      className={className}
      variant="filter"
    />
  );
}

/** "1–50 of 2,738", first/prev/next/last buttons and rows-per-page. */
export function Pagination({
  page,
  pageSize,
  total,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  className?: string;
}) {
  const { setParams, pending } = useUrlParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (p: number) =>
    setParams({ page: p > 1 ? String(p) : null }, { resetPage: false });

  const button = (
    target: number,
    disabled: boolean,
    label: string,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      onClick={() => go(target)}
      disabled={disabled || pending}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
    >
      {icon}
    </button>
  );

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 text-[13px]", className)}
    >
      <span className="text-muted-foreground tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-0.5">
        {button(
          1,
          page <= 1,
          "First page",
          <ChevronsLeft className="size-4" />,
        )}
        {button(
          page - 1,
          page <= 1,
          "Previous page",
          <ChevronLeft className="size-4" />,
        )}
        <span className="min-w-16 text-center text-muted-foreground tabular-nums">
          {page} / {pages.toLocaleString()}
        </span>
        {button(
          page + 1,
          page >= pages,
          "Next page",
          <ChevronRight className="size-4" />,
        )}
        {button(
          pages,
          page >= pages,
          "Last page",
          <ChevronsRight className="size-4" />,
        )}
      </div>
      <DropdownSelect
        label="Rows per page"
        size="sm"
        value={String(pageSize)}
        onValueChange={(value) =>
          setParams({ size: value === "50" ? null : value })
        }
        options={[25, 50, 100].map((n) => ({
          value: String(n),
          label: `${n} / page`,
        }))}
      />
    </div>
  );
}

/** Column header that sorts by a field; click again to reverse. */
export function SortHeader({
  field,
  children,
  current,
}: {
  field: string;
  children: ReactNode;
  current: { field: string; dir: "asc" | "desc" };
}) {
  const { setParams } = useUrlParams();
  const active = current.field === field;
  const next = active && current.dir === "asc" ? "desc" : "asc";
  const Icon = !active
    ? ArrowUpDown
    : current.dir === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => setParams({ sort: `${field}.${next}` })}
      className={cn(
        "group inline-flex items-center gap-1 tracking-wider uppercase transition-colors hover:text-primary",
        active && "text-primary",
      )}
    >
      {children}
      <Icon
        className={cn(
          "size-3 transition-opacity",
          active ? "opacity-100" : "opacity-40 group-hover:opacity-100",
        )}
      />
    </button>
  );
}

/**
 * Scrollable table card with a sticky header, sized to the viewport. Instantly
 * style: hairline rows, small uppercase bold headers, subtle row hover.
 */
export function TableFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-h-[calc(100dvh-11rem)] min-h-64 overflow-auto rounded-lg border bg-card",
        "[&_table]:w-full [&_table]:text-left [&_table]:text-sm",
        "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card [&_thead]:shadow-[0_1px_0_var(--border)]",
        "[&_th]:h-10 [&_th]:py-0 [&_th]:align-middle [&_th]:text-[11px] [&_th]:font-semibold [&_th]:tracking-wider [&_th]:whitespace-nowrap [&_th]:text-foreground [&_th]:uppercase",
        "[&_tbody>tr]:border-b [&_tbody>tr]:transition-colors [&_tbody>tr:hover]:bg-accent/40 [&_tbody>tr:last-child]:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

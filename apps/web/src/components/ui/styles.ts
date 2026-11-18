import { cn } from "@/lib/utils";

/** Form field look shared by inputs, selects and pickers (Instantly style). */
export const fieldTriggerClass =
  "group inline-flex h-10 items-center justify-between gap-2 rounded-md border border-input bg-muted px-3 text-left text-sm transition-colors outline-none hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 data-[state=open]:border-primary data-[state=open]:ring-[3px] data-[state=open]:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Toolbar filter button: borderless text with a chevron ("Status ⌄"), blue when
 * a value is applied.
 */
export function filterTriggerClass(active: boolean, className?: string) {
  return cn(
    "group inline-flex h-9 max-w-64 items-center gap-1.5 rounded-md px-2.5 text-left text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-accent disabled:opacity-50",
    active ? "text-primary" : "text-foreground",
    className,
  );
}

/** Floating menus and pickers. */
export const popoverClass =
  "z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1";

/** One row in a menu or picker list. */
export const menuItemClass =
  "relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-sm transition-colors outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[selected=true]:bg-accent";

/** Search box at the top of a picker. */
export const pickerSearchClass =
  "h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground";

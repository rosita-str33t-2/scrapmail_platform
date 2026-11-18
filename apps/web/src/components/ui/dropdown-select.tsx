"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  fieldTriggerClass,
  filterTriggerClass,
  menuItemClass,
  popoverClass,
} from "./styles";

export type DropdownOption = {
  value: string;
  label: string;
  /** Small text on the right (e.g. a count). */
  hint?: string;
  /** Element before the label (e.g. a colored dot). */
  icon?: ReactNode;
};

// Radix Select does not allow "" as an item value; use a placeholder value.
const EMPTY = "__empty__";

/**
 * Styled dropdown (Radix Select): keyboard accessible, with a check mark on the
 * selected item. `value` may be "" (e.g. "All countries").
 *
 * variant "filter": a borderless toolbar button that shows `label` until a
 * value is chosen, then the chosen option in blue (Instantly's "Status ⌄").
 */
export function DropdownSelect({
  value,
  onValueChange,
  options,
  label,
  disabled,
  className,
  size = "default",
  variant = "field",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: DropdownOption[];
  label: string;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
  variant?: "field" | "filter";
}) {
  const selected = options.find((o) => o.value === value);
  const isFilter = variant === "filter";
  const filterText = value === "" ? label : (selected?.label ?? label);

  return (
    <SelectPrimitive.Root
      value={value === "" ? EMPTY : value}
      onValueChange={(v) => onValueChange(v === EMPTY ? "" : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={
          isFilter
            ? filterTriggerClass(value !== "", className)
            : cn(fieldTriggerClass, size === "sm" && "h-8 px-2.5", className)
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {!isFilter && selected?.icon}
          <span className="truncate">
            {isFilter ? (
              <SelectPrimitive.Value>{filterText}</SelectPrimitive.Value>
            ) : (
              <SelectPrimitive.Value placeholder={label} />
            )}
          </span>
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className={cn(
              "shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180",
              isFilter ? "size-3.5 opacity-70" : "size-4 text-muted-foreground",
            )}
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          align="start"
          className={cn(
            popoverClass,
            "relative max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) p-1",
            isFilter && "min-w-52",
          )}
        >
          <SelectPrimitive.Viewport className="max-h-80">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value || EMPTY}
                value={option.value === "" ? EMPTY : option.value}
                className={cn(
                  menuItemClass,
                  "data-[state=checked]:font-medium",
                )}
              >
                {option.icon}
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                {option.hint && (
                  <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                    {option.hint}
                  </span>
                )}
                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

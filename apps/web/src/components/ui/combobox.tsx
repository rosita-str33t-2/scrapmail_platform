"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { type ReactNode, useState } from "react";

import { searchable } from "@/lib/countries";
import { cn } from "@/lib/utils";

import { fieldTriggerClass, pickerSearchClass, popoverClass } from "./styles";

export type ComboboxOption = {
  value: string;
  label: string;
  hint?: string;
  /** Extra words that should match the search (e.g. a country code). */
  keywords?: string[];
  muted?: boolean;
};

export type ComboboxGroup = { heading?: string; options: ComboboxOption[] };

/** Dropdown with a search box: type to filter long lists (accent-insensitive). */
export function Combobox({
  value,
  onValueChange,
  groups,
  label,
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  icon,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  groups: ComboboxGroup[];
  label: string;
  searchPlaceholder?: string;
  emptyText?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = groups
    .flatMap((g) => g.options)
    .find((o) => o.value === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        className={cn(fieldTriggerClass, className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{selected?.label ?? label}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(popoverClass, "w-72")}
        >
          <Command
            filter={(itemValue, search, keywords) => {
              const haystack = searchable(
                `${itemValue} ${(keywords ?? []).join(" ")}`,
              );
              return haystack.includes(searchable(search.trim())) ? 1 : 0;
            }}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder={searchPlaceholder}
                className={pickerSearchClass}
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto overscroll-contain p-1">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </Command.Empty>
              {groups.map((group, index) => (
                <Command.Group
                  key={group.heading ?? index}
                  heading={group.heading}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {group.options.map((option) => (
                    <Command.Item
                      key={option.value || "__all"}
                      value={`${option.label}__${option.value}`}
                      keywords={option.keywords}
                      onSelect={() => {
                        onValueChange(option.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-sm transition-colors outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                        option.muted && "text-muted-foreground",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {option.hint && (
                        <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                          {option.hint}
                        </span>
                      )}
                      {option.value === value && (
                        <Check className="absolute right-2 size-4 text-primary" />
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

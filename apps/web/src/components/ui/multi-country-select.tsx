"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";

import { ALL_COUNTRIES, countryName, searchable } from "@/lib/countries";
import { cn } from "@/lib/utils";

import { fieldTriggerClass, pickerSearchClass, popoverClass } from "./styles";

/** Searchable multi-select of countries, with quick presets. */
export function MultiCountrySelect({
  value,
  onChange,
  presets = [],
  disabled,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  presets?: { label: string; codes: string[] }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const toggle = (code: string) =>
    onChange(
      selected.has(code) ? value.filter((c) => c !== code) : [...value, code],
    );

  const summary =
    value.length === 0
      ? "Choose countries"
      : value.length === ALL_COUNTRIES.length
        ? `All countries (${value.length})`
        : value.length <= 3
          ? value.map((c) => countryName(c)).join(", ")
          : `${value.length} countries`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(fieldTriggerClass, "w-72")}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{summary}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(popoverClass, "w-80")}
        >
          <Command
            filter={(itemValue, search, keywords) =>
              searchable(`${itemValue} ${(keywords ?? []).join(" ")}`).includes(
                searchable(search.trim()),
              )
                ? 1
                : 0
            }
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Search countries…"
                className={pickerSearchClass}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
              {[
                ...presets,
                {
                  label: "All countries",
                  codes: ALL_COUNTRIES.map((c) => c.code),
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChange(preset.codes)}
                  className="rounded-md border px-2 py-1 text-xs transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  {preset.label}
                </button>
              ))}
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear ({value.length})
                </button>
              )}
            </div>
            <Command.List className="max-h-72 overflow-y-auto overscroll-contain p-1">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No country found.
              </Command.Empty>
              {ALL_COUNTRIES.map((c) => {
                const checked = selected.has(c.code);
                return (
                  <Command.Item
                    key={c.code}
                    value={`${c.name}__${c.code}`}
                    keywords={[c.code]}
                    onSelect={() => toggle(c.code)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.code}
                    </span>
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

"use client";

import { Check, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenu } from "radix-ui";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

const THEMES = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** "Jane van Dijk" -> "JD", "info@x.com" -> "I". */
function initials(name: string) {
  const words = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

const itemClass =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent";

/** Avatar button with the account, theme and sign-out options. */
export function UserMenu({
  displayName,
  email,
  signOut,
  side = "right",
}: {
  displayName: string;
  email: string;
  signOut: () => Promise<void>;
  side?: "right" | "bottom";
}) {
  const { theme, setTheme } = useTheme();
  const [signingOut, startSignOut] = useTransition();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        title={displayName}
        className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary transition-shadow outline-none hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/40"
      >
        {initials(displayName)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align="end"
          sideOffset={10}
          className="z-50 w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {email !== displayName && (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            )}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Theme
          </DropdownMenu.Label>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenu.Item
              key={value}
              onSelect={(event) => {
                event.preventDefault();
                setTheme(value);
              }}
              className={itemClass}
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
              <Check
                className={cn(
                  "ml-auto size-4 text-primary",
                  theme !== value && "invisible",
                )}
              />
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            disabled={signingOut}
            onSelect={(event) => {
              event.preventDefault();
              startSignOut(() => signOut());
            }}
            className={itemClass}
          >
            <LogOut className="size-4 text-muted-foreground" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

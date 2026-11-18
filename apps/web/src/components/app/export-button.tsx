"use client";

import { Download, Loader2 } from "lucide-react";
import { Popover } from "radix-ui";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { popoverClass } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

const PRESETS = [100, 500, 1000, 2500, 5000, 10000];
const MAX = 100_000;

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * "Export CSV": asks how many emails of the current filtered list to export (all
 * by default), then downloads them in Instantly's format. `href` is the export
 * route with the list's filters.
 */
export function ExportButton({
  href,
  count,
  unit,
}: {
  href: string;
  /** Number of rows in the filtered list. */
  count: number;
  /** What the list rows are: contacts (one email each) or agencies. */
  unit: "contacts" | "agencies";
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(""); // "" = all
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const limit = Number.parseInt(amount, 10);
  const hasLimit = amount !== "";
  const valid = !hasLimit || (Number.isInteger(limit) && limit >= 1);
  // Contacts: at most one email per row. Agencies can have several emails each.
  const presets =
    unit === "contacts" ? PRESETS.filter((n) => n < count) : PRESETS;

  function onOpenChange(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (next) setError(undefined);
  }

  async function onExport(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      setError("Enter a number of emails, or choose All.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const url = hasLimit
        ? `${href}${href.includes("?") ? "&" : "?"}limit=${Math.min(limit, MAX)}`
        : href;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setError("Export failed. Please try again.");
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "instantly-leads.csv";
      saveFile(await res.blob(), name);
      setOpen(false);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    cn(
      "h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors",
      active
        ? "border-primary bg-primary/10 text-primary"
        : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
    );

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button disabled={count === 0}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {busy ? "Exporting…" : "Export CSV"}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(popoverClass, "w-[340px] p-4")}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("export-amount")?.focus();
          }}
        >
          <form onSubmit={onExport}>
            <p className="text-sm font-semibold">Export to Instantly CSV</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {unit === "contacts"
                ? `${count.toLocaleString()} contacts match the current filters.`
                : `Emails of the ${count.toLocaleString()} agencies that match the current filters.`}
            </p>

            <Label htmlFor="export-amount" className="mt-4 block">
              How many emails?
            </Label>
            <Input
              id="export-amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX}
              placeholder={
                unit === "contacts" ? `All (${count.toLocaleString()})` : "All"
              }
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={chip(!hasLimit)}
                onClick={() => setAmount("")}
              >
                All
              </button>
              {presets.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={chip(hasLimit && limit === n)}
                  onClick={() => setAmount(String(n))}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The first emails of the list in its current order. Each address is
              exported once.
            </p>

            {error && (
              <p role="alert" className="mt-3 text-[13px] text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="mt-4 w-full"
              disabled={busy || !valid}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Download />}
              {busy
                ? "Exporting…"
                : hasLimit && valid
                  ? `Export ${Math.min(limit, MAX).toLocaleString()} emails`
                  : "Export all emails"}
            </Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

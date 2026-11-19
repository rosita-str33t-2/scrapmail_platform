"use client";

import {
  Download,
  Loader2,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { popoverClass } from "@/components/ui/styles";
import { LEVEL_OPTIONS } from "@/lib/export-level-options";
import {
  getLevelState,
  type LevelState,
  resetAllLevels,
  undoLastExport,
} from "@/lib/export-levels";
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
 * by default), then downloads them in Instantly's format, best agencies first.
 * Every exported address goes up one level. The panel can also undo the last
 * export or set every level back to 0.
 *
 * Contacts: the level comes from the list's Level filter (`level`).
 * Agencies: the level is chosen in the panel (level 0 by default).
 */
export function ExportButton({
  href,
  count,
  unit,
  level,
}: {
  /** The export route with the list's filters. */
  href: string;
  /** Number of rows in the filtered list. */
  count: number;
  /** What the list rows are: contacts (one email each) or agencies. */
  unit: "contacts" | "agencies";
  /** Contacts only: the list's Level filter ("" = any level). */
  level?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(""); // "" = all
  const [panelLevel, setPanelLevel] = useState("0");
  const [busy, setBusy] = useState<"export" | "undo" | "reset" | null>(null);
  const [confirm, setConfirm] = useState<"undo" | "reset" | null>(null);
  const [state, setState] = useState<LevelState | null>(null);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const limit = Number.parseInt(amount, 10);
  const hasLimit = amount !== "";
  const valid = !hasLimit || (Number.isInteger(limit) && limit >= 1);
  const activeLevel = unit === "contacts" ? (level ?? "") : panelLevel;
  // Contacts: at most one email per row. Agencies can have several emails each.
  const presets =
    unit === "contacts" ? PRESETS.filter((n) => n < count) : PRESETS;

  function onOpenChange(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (next) {
      setError(undefined);
      setMessage(undefined);
      setConfirm(null);
      getLevelState()
        .then(setState)
        .catch(() => setState(null));
    }
  }

  async function onExport(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      setError("Enter a number of emails, or choose All.");
      return;
    }
    setBusy("export");
    setError(undefined);
    setMessage(undefined);
    try {
      const query = new URLSearchParams();
      if (hasLimit) query.set("limit", String(Math.min(limit, MAX)));
      if (unit === "agencies" && panelLevel) query.set("level", panelLevel);
      const extra = query.toString();
      const url = extra
        ? `${href}${href.includes("?") ? "&" : "?"}${extra}`
        : href;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setError(
          res.status === 409
            ? await res.text()
            : "Export failed. Please try again.",
        );
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "instantly-leads.csv";
      saveFile(await res.blob(), name);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function run(action: "undo" | "reset") {
    setBusy(action);
    setError(undefined);
    setMessage(undefined);
    try {
      const undone = state?.lastExport?.exported ?? 0;
      setState(await (action === "undo" ? undoLastExport() : resetAllLevels()));
      setMessage(
        action === "undo"
          ? `Last export undone: ${undone.toLocaleString()} emails went down one level.`
          : "All emails are back at level 0.",
      );
      router.refresh();
    } catch {
      setError("That did not work. Please try again.");
    } finally {
      setBusy(null);
      setConfirm(null);
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
        <Button>
          {busy === "export" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          {busy === "export" ? "Exporting…" : "Export CSV"}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className={cn(popoverClass, "w-[360px] p-0")}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("export-amount")?.focus();
          }}
        >
          <form onSubmit={onExport} className="p-4">
            <p className="text-sm font-semibold">Export to Instantly CSV</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {unit === "contacts"
                ? `${count.toLocaleString()} contacts match the current filters.`
                : `Emails of the ${count.toLocaleString()} agencies that match the current filters.`}
            </p>

            {unit === "agencies" ? (
              <>
                <Label className="mt-4 block">Level</Label>
                <DropdownSelect
                  label="Level"
                  value={panelLevel}
                  onValueChange={setPanelLevel}
                  options={[
                    ...LEVEL_OPTIONS,
                    { value: "", label: "Any level" },
                  ]}
                  className="mt-1.5 w-full"
                />
              </>
            ) : (
              level && (
                <p className="mt-3 text-[13px]">
                  Level filter:{" "}
                  <span className="font-medium text-primary">
                    {LEVEL_OPTIONS.find((o) => o.value === level)?.label}
                  </span>
                </p>
              )
            )}
            {!activeLevel && (
              <p className="mt-2 flex gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-warning">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                {unit === "contacts"
                  ? "No Level filter: emails that were already exported are included. Set Level to 0 to export only new emails."
                  : "Any level: emails that were already exported are included."}
              </p>
            )}

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
              Best agencies first (P1 → P4). Each address is exported once and
              goes up one level.
            </p>

            {error && (
              <p role="alert" className="mt-3 text-[13px] text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="mt-3 text-[13px] text-success">
                {message}
              </p>
            )}
            <Button
              type="submit"
              className="mt-4 w-full"
              disabled={
                busy !== null || !valid || (unit === "contacts" && count === 0)
              }
            >
              {busy === "export" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              {busy === "export"
                ? "Exporting…"
                : hasLimit && valid
                  ? `Export ${Math.min(limit, MAX).toLocaleString()} emails`
                  : "Export all emails"}
            </Button>
          </form>

          {/* Undo and reset */}
          <div className="space-y-2 border-t bg-muted/40 px-4 py-3 text-[13px]">
            {confirm ? (
              <div className="space-y-2.5">
                <p>
                  {confirm === "undo"
                    ? `Lower the level of the ${(state?.lastExport?.exported ?? 0).toLocaleString()} emails of the last export by 1? Only do this if the file was not used in Instantly.`
                    : `Set all ${(state?.raised ?? 0).toLocaleString()} exported emails back to level 0? They can then be exported again, including ones Instantly already sent to.`}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy !== null}
                    onClick={() => run(confirm)}
                  >
                    {busy === confirm && <Loader2 className="animate-spin" />}
                    {confirm === "undo" ? "Yes, undo" : "Yes, reset all"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-muted-foreground">
                    {state?.lastExport ? (
                      <>
                        Last export:{" "}
                        <span className="text-foreground tabular-nums">
                          {state.lastExport.exported.toLocaleString()} emails
                        </span>{" "}
                        ·{" "}
                        {new Date(state.lastExport.created_at).toLocaleString(
                          undefined,
                          { dateStyle: "medium", timeStyle: "short" },
                        )}
                      </>
                    ) : (
                      "No export to undo"
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2"
                    disabled={busy !== null || !state?.lastExport}
                    onClick={() => setConfirm("undo")}
                  >
                    <Undo2 /> Undo
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Exported at least once:{" "}
                    <span className="text-foreground tabular-nums">
                      {state ? state.raised.toLocaleString() : "…"}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2"
                    disabled={busy !== null || !state?.raised}
                    onClick={() => setConfirm("reset")}
                  >
                    <RotateCcw /> Reset all to 0
                  </Button>
                </div>
              </>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

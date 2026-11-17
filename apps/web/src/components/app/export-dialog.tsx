"use client";

import { Download, RotateCcw } from "lucide-react";
import { type FormEvent, useState } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ExportSummary,
  getExportSummary,
  resetExports,
} from "@/lib/export-actions";

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

const PRESETS = [1000, 3000, 5000];

/**
 * "Export CSV": the next N best emails that were not exported yet, in Instantly's
 * format. Independent of the list filters. Also lets the user download an earlier
 * export again and reset all emails to unused.
 */
export function ExportDialog() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [count, setCount] = useState("3000");
  const [busy, setBusy] = useState<"export" | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  function load() {
    getExportSummary()
      .then(setSummary)
      .catch(() => setError("Could not load the export status."));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(undefined);
      setMessage(undefined);
      setConfirmReset(false);
      load();
    }
  }

  async function onExport(event: FormEvent) {
    event.preventDefault();
    const n = Number.parseInt(count, 10);
    if (!Number.isInteger(n) || n < 1) {
      setError("Enter how many emails to export.");
      return;
    }
    setBusy("export");
    setError(undefined);
    setMessage(undefined);
    try {
      const res = await fetch("/contacts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: n }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "instantly-leads.csv";
      saveFile(await res.blob(), name);
      const exported = Number(res.headers.get("X-Exported-Count") ?? n);
      setMessage(
        `${exported.toLocaleString()} emails exported and marked as used.`,
      );
      load();
    } catch {
      setError("The export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onReset() {
    setBusy("reset");
    setError(undefined);
    setMessage(undefined);
    try {
      setSummary(await resetExports());
      setMessage("All emails are unused again.");
    } catch {
      setError("The reset failed. Please try again.");
    } finally {
      setBusy(null);
      setConfirmReset(false);
    }
  }

  const unused = summary?.unused ?? 0;
  const used = summary ? summary.total - summary.unused : 0;
  const requested = Number.parseInt(count, 10) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download /> Export CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Export emails for Instantly</DialogTitle>
        <DialogDescription>
          The best emails that were not exported yet, highest priority first.
          List filters do not apply.
        </DialogDescription>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted px-4 py-3">
            <p className="text-muted-foreground">Not exported yet</p>
            <p className="text-xl font-bold">
              {summary ? unused.toLocaleString() : "…"}
            </p>
          </div>
          <div className="rounded-lg bg-muted px-4 py-3">
            <p className="text-muted-foreground">Already exported</p>
            <p className="text-xl font-bold">
              {summary ? used.toLocaleString() : "…"}
            </p>
          </div>
        </div>

        <form onSubmit={onExport} className="mt-5 space-y-3">
          <Label htmlFor="export-count">How many emails?</Label>
          <Input
            id="export-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            required
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setCount(String(n))}
              >
                {n.toLocaleString()}
              </Button>
            ))}
            {summary && unused > 0 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setCount(String(unused))}
              >
                All ({unused.toLocaleString()})
              </Button>
            )}
          </div>
          {summary && requested > unused && unused > 0 && (
            <p className="text-sm text-muted-foreground">
              Only {unused.toLocaleString()} unused emails are left; the file
              will contain those.
            </p>
          )}
          <FormAlert error={error} message={message} />
          <Button
            type="submit"
            className="w-full"
            disabled={busy !== null || (summary !== null && unused === 0)}
          >
            <Download />
            {busy === "export" ? "Exporting…" : "Export CSV"}
          </Button>
        </form>

        {summary && summary.batches.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Recent exports</h3>
            <ul className="mt-2 divide-y rounded-lg border text-sm">
              {summary.batches.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span>
                    {new Date(b.created_at).toLocaleString()} ·{" "}
                    {b.exported.toLocaleString()} emails
                    {b.cleared_at && (
                      <span className="text-muted-foreground"> · reset</span>
                    )}
                  </span>
                  <a
                    href={`/contacts/export/${b.id}`}
                    className="shrink-0 font-medium text-primary hover:underline"
                  >
                    Download again
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 border-t pt-4">
          {confirmReset ? (
            <div className="space-y-3">
              <p className="text-sm">
                Mark all {used.toLocaleString()} exported emails as unused? The
                next exports can include them again.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={onReset}
                  disabled={busy !== null}
                >
                  {busy === "reset" ? "Resetting…" : "Yes, reset"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmReset(false)}
                  disabled={busy !== null}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={busy !== null || used === 0}
            >
              <RotateCcw /> Mark all emails as unused
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

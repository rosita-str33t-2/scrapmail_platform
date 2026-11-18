"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

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
 * "Export CSV": downloads every email in the current filtered list at once, in
 * Instantly's format. `href` is the export route with the list's filters.
 */
export function ExportButton({
  href,
  count,
}: {
  href: string;
  /** Number of rows in the list; nothing to export when 0. */
  count: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onExport() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        setError("Export failed. Please try again.");
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "instantly-leads.csv";
      saveFile(await res.blob(), name);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && (
        <span role="alert" className="text-[13px] text-destructive">
          {error}
        </span>
      )}
      <Button onClick={onExport} disabled={busy || count === 0}>
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        {busy ? "Exporting…" : "Export CSV"}
      </Button>
    </>
  );
}

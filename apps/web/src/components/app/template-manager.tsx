"use client";

import { FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  deleteReplyTemplate,
  saveReplyTemplate,
  updateReplyTemplate,
} from "@/lib/reply-actions";
import { cn } from "@/lib/utils";

import type { EmailEditorHandle } from "./email-editor";

const EmailEditor = dynamic(
  () => import("./email-editor").then((m) => m.EmailEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[13.5rem] animate-pulse rounded-md border bg-muted/40" />
    ),
  },
);

type Template = {
  id: string;
  name: string;
  subject: string | null;
  body_html: string;
  updated_at: string;
};

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-muted px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20";

/** List of templates on the left, the selected one in the editor on the right. */
export function TemplateManager({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const editor = useRef<EmailEditorHandle>(null);
  const [selected, setSelected] = useState<string>(templates[0]?.id ?? "new");
  const current = templates.find((t) => t.id === selected) ?? null;
  const [name, setName] = useState(current?.name ?? "");
  const [subject, setSubject] = useState(current?.subject ?? "");
  const [error, setError] = useState<string | null>(null);
  // Changes only when another template is opened (not after saving a new one).
  const [editorKey, setEditorKey] = useState(0);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const open = (t: Template | null) => {
    setSelected(t?.id ?? "new");
    setEditorKey((k) => k + 1);
    setName(t?.name ?? "");
    setSubject(t?.subject ?? "");
    setError(null);
  };

  const save = () => {
    const html = editor.current?.getContent().html ?? "";
    setError(null);
    startSaving(async () => {
      const input = { name, subject: subject || undefined, html };
      const result = current
        ? await updateReplyTemplate({ id: current.id, ...input })
        : await saveReplyTemplate(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Template "${name.trim()}" saved`);
      if (!current && result.id) setSelected(result.id); // now editing it
      router.refresh();
    });
  };

  const remove = () => {
    if (!current) return;
    if (!window.confirm(`Delete the template "${current.name}"?`)) return;
    startDeleting(async () => {
      const result = await deleteReplyTemplate(current.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Template "${current.name}" deleted`);
      open(templates.find((t) => t.id !== current.id) ?? null);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <nav
        aria-label="Templates"
        className="h-fit overflow-hidden rounded-lg border bg-card"
      >
        <div className="border-b p-2">
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => open(null)}
          >
            <Plus /> New template
          </Button>
        </div>
        {templates.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No templates yet.
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto p-1">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => open(t)}
                  aria-current={t.id === selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent",
                    t.id === selected && "bg-accent",
                  )}
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {t.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.subject ||
                        `Updated ${new Date(t.updated_at).toLocaleDateString(
                          "en-GB",
                          { dateStyle: "medium" },
                        )}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <section
        aria-label={current ? `Edit ${current.name}` : "New template"}
        className="rounded-lg border bg-card p-4"
      >
        <h2 className="mb-3 text-[15px] font-semibold">
          {current ? "Edit template" : "New template"}
        </h2>
        <div className="grid gap-2 text-sm sm:grid-cols-[4.5rem_1fr]">
          <label htmlFor="template-name" className="pt-2 text-muted-foreground">
            Name
          </label>
          <input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Thanks for your interest"
            className={fieldClass}
          />
          <label
            htmlFor="template-subject"
            className="pt-2 text-muted-foreground"
          >
            Subject
          </label>
          <input
            id="template-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={300}
            placeholder="Optional: replaces the reply's subject"
            className={fieldClass}
          />
        </div>
        <div className="mt-3">
          <EmailEditor
            key={editorKey}
            editorRef={editor}
            initialHtml={current?.body_html ?? ""}
            placeholder="Write the template… Use {{firstName}} and other variables."
            onSubmit={save}
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save template
          </Button>
          {current && (
            <Button
              type="button"
              variant="ghost"
              onClick={remove}
              disabled={deleting}
              className="ml-auto text-danger hover:text-danger"
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

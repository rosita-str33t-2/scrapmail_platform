"use client";

import {
  BookmarkPlus,
  FileText,
  Loader2,
  PenLine,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { popoverClass } from "@/components/ui/styles";
import { SIGNATURE_HTML } from "@/lib/email-signature";
import type { ReplyTemplate } from "@/lib/inbox";
import {
  deleteReplyTemplate,
  saveReplyTemplate,
  sendReply,
} from "@/lib/reply-actions";
import { cn } from "@/lib/utils";

import { EmailBody } from "./email-body";
import type { EmailEditorHandle } from "./email-editor";
import { type ScheduledSend, scheduleSend, UNDO_SECONDS } from "./undo-send";

// The editor is only downloaded on conversation pages, after the page is shown.
const EmailEditor = dynamic(
  () => import("./email-editor").then((m) => m.EmailEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[13.5rem] animate-pulse rounded-md border bg-muted/40" />
    ),
  },
);

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-muted px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20";

/** Reply form at the bottom of a conversation. */
export function ReplyComposer({
  replyId,
  from,
  to,
  defaultSubject,
  templates,
  canSend,
}: {
  replyId: string;
  from: string | null;
  to: string;
  defaultSubject: string;
  templates: ReplyTemplate[];
  /** False when the Instantly key may only read. */
  canSend: boolean;
}) {
  const router = useRouter();
  const editor = useRef<EmailEditorHandle>(null);
  const [subject, setSubject] = useState(defaultSubject);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCopies, setShowCopies] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  // Waiting for "Undo" (10 s), then going out to Instantly.
  const [pending, setPending] = useState<{
    endsAt: number;
    handle: ScheduledSend;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(0);
  const mounted = useRef(true);
  const toastId = `undo-send-${replyId}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const tick = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tick);
  }, [pending]);

  /** Sends to Instantly (also when the user has moved to another page). */
  const deliver = async (payload: Parameters<typeof sendReply>[0]) => {
    if (mounted.current) setSending(true);
    const result = await sendReply(payload).catch(() => ({
      ok: false as const,
      error: "The reply could not be sent. Please try again.",
    }));
    toast.dismiss(toastId);
    if (!result.ok) {
      toast.error(`Reply to ${to} was not sent: ${result.error}`);
      if (mounted.current) {
        setError(result.error);
        setSending(false);
        setPending(null);
      }
      return;
    }
    toast.success(`Reply sent to ${to}`);
    if (mounted.current) {
      editor.current?.clear();
      setCc("");
      setBcc("");
      setSending(false);
      setPending(null);
      router.refresh();
    }
  };

  const undo = (handle: ScheduledSend) => {
    if (!handle.cancel()) return; // already on its way
    toast.dismiss(toastId);
    toast("Sending cancelled. Your reply was not sent.");
    if (mounted.current) {
      setPending(null);
      editor.current?.focus();
    }
  };

  const send = () => {
    if (pending || sending || !editor.current) return;
    const { html, text } = editor.current.getContent();
    setError(null);
    // Checked now, so nothing fails after the 10 seconds for a simple reason.
    if (!subject.trim()) {
      setError("Please enter a subject.");
      return;
    }
    if (!text.trim() && !/<img/i.test(html)) {
      setError("Please write a message.");
      return;
    }
    const payload = { replyId, subject, html, text, cc, bcc };
    const handle = scheduleSend(() => void deliver(payload));
    setNow(Date.now());
    setPending({ endsAt: Date.now() + UNDO_SECONDS * 1000, handle });
    toast(`Sending your reply to ${to}…`, {
      id: toastId,
      duration: UNDO_SECONDS * 1000 + 1000,
      action: { label: "Undo", onClick: () => undo(handle) },
    });
  };

  const secondsLeft = pending
    ? Math.max(1, Math.ceil((pending.endsAt - now) / 1000))
    : 0;
  const locked = Boolean(pending) || sending;

  return (
    <section
      aria-label="Reply"
      className="rounded-lg border bg-card p-4 shadow-sm"
    >
      {!canSend && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-warning-surface px-3 py-2 text-[13px] text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Replies cannot be sent yet: the Instantly API key can only read. The
            administrator needs to set an Instantly key with the <b>all:all</b>{" "}
            scope. You can still write and save templates.
          </span>
        </p>
      )}

      {/* Locked while the reply waits to go out (Undo restores editing). */}
      <div
        inert={locked}
        className={cn("transition-opacity", locked && "opacity-60")}
      >
        <div className="grid gap-2 text-sm sm:grid-cols-[4.5rem_1fr]">
          <span className="pt-2 text-muted-foreground">From</span>
          <div
            className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-dashed px-3"
            title="The reply is sent through Instantly from this business address. No email login is needed."
          >
            <span className="truncate font-medium">
              {from ?? "Unknown account"}
            </span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              · business address that got this email, sent via Instantly
            </span>
          </div>
          <span className="pt-2 text-muted-foreground">To</span>
          <div className="flex items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center truncate rounded-md border border-dashed px-3">
              {to}
            </div>
            {!showCopies && (
              <button
                type="button"
                onClick={() => setShowCopies(true)}
                className="h-9 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-accent"
              >
                CC / BCC
              </button>
            )}
          </div>
          {showCopies && (
            <>
              <label htmlFor="reply-cc" className="pt-2 text-muted-foreground">
                CC
              </label>
              <input
                id="reply-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="name@company.com, …"
                className={fieldClass}
              />
              <label htmlFor="reply-bcc" className="pt-2 text-muted-foreground">
                BCC
              </label>
              <input
                id="reply-bcc"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="name@company.com, …"
                className={fieldClass}
              />
            </>
          )}
          <label htmlFor="reply-subject" className="pt-2 text-muted-foreground">
            Subject
          </label>
          <input
            id="reply-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={fieldClass}
            maxLength={300}
          />
        </div>

        <div className="mt-3">
          <EmailEditor editorRef={editor} onSubmit={send} />
        </div>

        <details
          className="group mt-2 rounded-md border bg-muted/30"
          onToggle={(e) => setShowSignature(e.currentTarget.open)}
        >
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-muted-foreground select-none">
            <PenLine className="size-3.5" />
            Signature added automatically below your message
            <span className="ml-auto text-primary group-open:hidden">Show</span>
            <span className="ml-auto hidden text-primary group-open:inline">
              Hide
            </span>
          </summary>
          <div className="px-3 pb-3">
            {showSignature && <EmailBody html={SIGNATURE_HTML} text={null} />}
          </div>
        </details>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md bg-danger-surface px-3 py-2 text-[13px] text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pending && !sending ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 py-1 pr-1 pl-3 text-sm"
          >
            <span className="tabular-nums">
              Sending in <b>{secondsLeft}</b> s…
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => undo(pending.handle)}
            >
              <Undo2 /> Undo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => pending.handle.now()}
            >
              Send now
            </Button>
          </div>
        ) : (
          <>
            <Button type="button" onClick={send} disabled={sending || !canSend}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {sending ? "Sending…" : "Send reply"}
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Ctrl + Enter · you can undo for {UNDO_SECONDS} seconds
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <TemplatesMenu
            templates={templates}
            onUse={(t) => {
              editor.current?.setContent(t.body_html);
              if (t.subject) setSubject(t.subject);
              editor.current?.focus();
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSaveOpen(true)}
          >
            <BookmarkPlus /> Save as template
          </Button>
        </div>
      </div>

      <SaveTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        getHtml={() => editor.current?.getContent().html ?? ""}
        subject={subject}
      />
    </section>
  );
}

function TemplatesMenu({
  templates,
  onUse,
}: {
  templates: ReplyTemplate[];
  onUse: (template: ReplyTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  const remove = async (t: ReplyTemplate) => {
    setDeleting(t.id);
    const result = await deleteReplyTemplate(t.id);
    setDeleting(null);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(`Template "${t.name}" deleted`);
      router.refresh();
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <FileText /> Templates
          {templates.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {templates.length}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          className={cn(popoverClass, "w-80 p-1.5")}
        >
          {templates.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">
              No templates yet. Write a message and choose “Save as template”.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {templates.map((t) => (
                <li key={t.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onUse(t);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left hover:bg-accent"
                  >
                    <span className="block truncate text-sm font-medium">
                      {t.name}
                    </span>
                    {t.subject && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.subject}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(t)}
                    disabled={deleting === t.id}
                    aria-label={`Delete template ${t.name}`}
                    title="Delete template"
                    className="rounded-md p-2 text-muted-foreground opacity-60 group-hover:opacity-100 hover:bg-accent hover:text-danger"
                  >
                    {deleting === t.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  getHtml,
  subject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getHtml: () => string;
  subject: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [keepSubject, setKeepSubject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const save = () => {
    setError(null);
    const html = getHtml();
    startSaving(async () => {
      const result = await saveReplyTemplate({
        name,
        html,
        subject: keepSubject ? subject : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Template "${name.trim()}" saved`);
      setName("");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Save as template</DialogTitle>
        <DialogDescription>
          The whole team can reuse this message in their replies.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="block text-sm font-medium">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Thanks for your interest"
              className={cn(fieldClass, "mt-1.5 font-normal")}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={keepSubject}
              onChange={(e) => setKeepSubject(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Also save the subject
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Save template
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

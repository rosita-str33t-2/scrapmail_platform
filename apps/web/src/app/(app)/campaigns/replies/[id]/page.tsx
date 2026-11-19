import {
  Bot,
  Building2,
  CornerUpLeft,
  Inbox,
  Megaphone,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { EmailBody } from "@/components/app/email-body";
import { InterestSelect } from "@/components/app/interest-select";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { ReplyComposer } from "@/components/app/reply-composer";
import { ReplyDoneButton } from "@/components/app/reply-done-button";
import { StatusBadge } from "@/components/app/status-badge";
import { loadConversation, type ThreadMessage } from "@/lib/inbox";
import { interestStatus } from "@/lib/interest-status";
import { canSendReplies } from "@/lib/send-permission";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversation" };

type Props = { params: Promise<{ id: string }> };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Instantly's step "0_0_0" -> "Step 1". */
function stepLabel(step: string | null) {
  const n = Number.parseInt(step ?? "", 10);
  return Number.isInteger(n) ? `Step ${n + 1}` : null;
}

function replySubject(subject: string | null) {
  const s = (subject ?? "").trim();
  if (!s) return "Re: your message";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9A-Za-z_-]{1,100}$/.test(id)) notFound();
  const [conversation, canSend] = await Promise.all([
    loadConversation(id),
    canSendReplies(),
  ]);
  if (!conversation) notFound();
  const { reply, thread, threadReplies, templates, agency, senders, notice } =
    conversation;

  const lastReceived =
    [...thread].reverse().find((m) => m.direction === "received") ?? null;
  const status = interestStatus(reply.interest_status);
  const replied = threadReplies.find((r) => r.replied_at)?.replied_at ?? null;

  return (
    <>
      <PageHeader
        title={reply.lead_email}
        description={reply.subject ?? undefined}
        back={{ href: "/campaigns/replies", label: "Back to replies" }}
        actions={
          <>
            <LiveRefresh kinds={["replies", "templates"]} />
            <InterestSelect replyId={reply.id} status={reply.interest_status} />
            <ReplyDoneButton id={reply.id} done={Boolean(reply.handled_at)} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3">
          {notice && (
            <p className="flex items-start gap-2 rounded-md bg-warning-surface px-3 py-2 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {notice}
            </p>
          )}

          <ol className="space-y-3" aria-label="Conversation">
            {thread.map((m) => (
              <li key={m.id}>
                <Message
                  message={m}
                  sender={m.sent_by ? senders.get(m.sent_by) : undefined}
                  highlight={m.id === reply.id}
                />
              </li>
            ))}
          </ol>

          <ReplyComposer
            key={lastReceived?.id ?? reply.id}
            replyId={reply.id}
            from={reply.eaccount}
            to={reply.lead_email}
            defaultSubject={replySubject(
              lastReceived?.subject ?? reply.subject,
            )}
            templates={templates}
            canSend={canSend}
          />
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-lg border bg-card p-4 text-sm">
            <h2 className="mb-3 text-[13px] font-semibold text-muted-foreground">
              Details
            </h2>
            <dl className="space-y-3">
              <Detail label="Lead">
                <span className="font-medium break-all">
                  {reply.lead_email}
                </span>
                {agency && (
                  <Link
                    href={`/agencies/${agency.id}`}
                    className="mt-0.5 flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Building2 className="size-3.5" /> {agency.name}
                  </Link>
                )}
              </Detail>
              <Detail label="Status">
                {status ? (
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                ) : (
                  <span className="text-muted-foreground">Lead</span>
                )}
              </Detail>
              <Detail label="Campaign">
                {reply.campaign_id ? (
                  <Link
                    href={`/campaigns/${reply.campaign_id}`}
                    className="flex items-center gap-1.5 hover:text-primary hover:underline"
                  >
                    <Megaphone className="size-3.5 text-muted-foreground" />
                    {reply.campaign_name ?? "Campaign"}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No campaign</span>
                )}
                {stepLabel(reply.step) && (
                  <span className="text-xs text-muted-foreground">
                    Replied to {stepLabel(reply.step)}
                  </span>
                )}
              </Detail>
              <Detail label="Received by">
                <span className="flex items-center gap-1.5 break-all">
                  <Inbox className="size-3.5 shrink-0 text-muted-foreground" />
                  {reply.eaccount ?? "—"}
                </span>
              </Detail>
              <Detail label="Handling">
                {replied ? (
                  <span className="flex items-center gap-1.5 text-success">
                    <CornerUpLeft className="size-3.5" /> Replied{" "}
                    {when(replied)}
                  </span>
                ) : reply.handled_at ? (
                  <span className="text-success">
                    Done {when(reply.handled_at)}
                  </span>
                ) : (
                  <span className="text-warning">Needs a reply</span>
                )}
              </Detail>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex flex-col">{children}</dd>
    </div>
  );
}

function Message({
  message: m,
  sender,
  highlight,
}: {
  message: ThreadMessage;
  sender?: string;
  highlight: boolean;
}) {
  const ours = m.direction === "sent";
  const who = ours
    ? (m.eaccount ?? m.from_email ?? "Us")
    : (m.from_email ?? "Lead");
  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-4",
        ours && "border-l-[3px] border-l-primary",
        highlight && !ours && "ring-1 ring-primary/30",
      )}
    >
      <header className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold uppercase",
            ours
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {who.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{who}</p>
          <p className="truncate text-xs text-muted-foreground">
            to {m.to_emails || (ours ? "the lead" : (m.eaccount ?? "us"))}
            {m.cc_emails ? ` · cc ${m.cc_emails}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {m.is_auto_reply && (
            <StatusBadge tone="neutral">
              <Bot className="size-3" /> Auto-reply
            </StatusBadge>
          )}
          {ours && m.sent_by && (
            <StatusBadge tone="info">
              Sent from Scrap&Mail{sender ? ` by ${sender}` : ""}
            </StatusBadge>
          )}
          {ours && !m.sent_by && stepLabel(m.step) && (
            <StatusBadge tone="neutral">
              Campaign · {stepLabel(m.step)}
            </StatusBadge>
          )}
          <time
            dateTime={m.sent_at}
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            {when(m.sent_at)}
          </time>
        </div>
      </header>
      {m.subject && <p className="mb-2 text-sm font-semibold">{m.subject}</p>}
      <EmailBody html={m.body_html} text={m.body_text} />
    </article>
  );
}

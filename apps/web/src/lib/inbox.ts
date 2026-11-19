import "server-only";

import { requireWorkspace } from "@/lib/auth/workspace";
import {
  type InstantlyEmail,
  InstantlyError,
  threadEmails,
} from "@/lib/instantly-api";
import { agenciesForEmails } from "@/lib/lead-agencies";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** A reply from a lead (one row of the Replies list). */
export type InboxReply = {
  id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  lead_email: string;
  lead_email_normalized: string;
  eaccount: string | null;
  subject: string | null;
  preview: string | null;
  thread_id: string | null;
  step: string | null;
  is_auto_reply: boolean;
  interest_status: number | null;
  received_at: string;
  handled_at: string | null;
  replied_at: string | null;
};

/** One email of a conversation. */
export type ThreadMessage = {
  id: string;
  direction: "received" | "sent";
  eaccount: string | null;
  from_email: string | null;
  to_emails: string | null;
  cc_emails: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  is_auto_reply: boolean;
  step: string | null;
  sent_at: string;
  sent_by: string | null;
};

export type ReplyTemplate = {
  id: string;
  name: string;
  subject: string | null;
  body_html: string;
};

const REPLY_COLUMNS =
  "id, campaign_id, campaign_name, lead_email, lead_email_normalized, eaccount, subject, preview, thread_id, step, is_auto_reply, interest_status, received_at, handled_at, replied_at";
const MESSAGE_COLUMNS =
  "id, direction, eaccount, from_email, to_emails, cc_emails, subject, body_html, body_text, is_auto_reply, step, sent_at, sent_by";

/** Our row for an email Instantly returned. */
function messageRow(
  workspaceId: string,
  email: InstantlyEmail,
  fallback: { threadId: string | null; lead: string },
) {
  return {
    id: email.id,
    workspace_id: workspaceId,
    thread_id: email.thread_id ?? fallback.threadId,
    lead_email: email.lead ?? fallback.lead,
    direction: email.ue_type === 2 ? "received" : "sent",
    campaign_id: email.campaign_id ?? null,
    eaccount: email.eaccount ?? null,
    from_email: email.from_address_email ?? null,
    to_emails: email.to_address_email_list ?? null,
    cc_emails: email.cc_address_email_list ?? null,
    subject: email.subject ?? null,
    body_html: email.body?.html ?? null,
    body_text: email.body?.text ?? null,
    is_auto_reply: email.is_auto_reply === 1,
    step: email.step ?? null,
    sent_at: email.timestamp_email ?? email.timestamp_created,
    synced_at: new Date().toISOString(),
  };
}

/** Threads being read from Instantly right now (one request per thread at a time). */
const loading = new Map<string, Promise<void>>();

/**
 * Reads a conversation from Instantly into our database when it is new or a newer
 * reply came in since it was last read. Otherwise nothing is asked from Instantly,
 * so opening conversations stays fast and within Instantly's 20 requests a minute.
 */
async function refreshThread(
  workspaceId: string,
  threadId: string,
  lead: string,
) {
  const key = `${workspaceId}:${threadId}`;
  const running = loading.get(key);
  if (running) return running;
  const job = (async () => {
    const admin = createAdminClient();
    const [{ data: thread }, { data: newest }] = await Promise.all([
      admin
        .from("campaign_threads")
        .select("fetched_at")
        .eq("workspace_id", workspaceId)
        .eq("thread_id", threadId)
        .maybeSingle<{ fetched_at: string }>(),
      admin
        .from("campaign_replies")
        .select("received_at")
        .eq("workspace_id", workspaceId)
        .eq("thread_id", threadId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ received_at: string }>(),
    ]);
    if (
      thread &&
      (!newest ||
        Date.parse(thread.fetched_at) >= Date.parse(newest.received_at))
    ) {
      return;
    }
    const emails = (await threadEmails(threadId)).filter(
      (e) => e.ue_type !== 4, // scheduled, not sent yet
    );
    if (emails.length) {
      // sent_by is not in the row, so replies sent from here keep their sender.
      const { error } = await admin.from("campaign_messages").upsert(
        emails.map((e) => messageRow(workspaceId, e, { threadId, lead })),
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
    }
    await admin.from("campaign_threads").upsert({
      workspace_id: workspaceId,
      thread_id: threadId,
      fetched_at: new Date().toISOString(),
    });
  })();
  loading.set(key, job);
  try {
    await job;
  } finally {
    loading.delete(key);
  }
}

/** Everything the conversation page shows. Null when the reply does not exist. */
export async function loadConversation(replyId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { data: reply } = await supabase
    .from("campaign_replies")
    .select(REPLY_COLUMNS)
    .eq("id", replyId)
    .maybeSingle<InboxReply>();
  if (!reply) return null;

  let notice: string | null = null;
  if (reply.thread_id) {
    try {
      await refreshThread(workspaceId, reply.thread_id, reply.lead_email);
    } catch (error) {
      notice =
        error instanceof InstantlyError && error.status === 429
          ? "Instantly is busy: showing the saved messages. Newer ones appear shortly."
          : "Could not load the whole conversation from Instantly: showing the saved messages.";
    }
  }

  const messagesQuery = supabase
    .from("campaign_messages")
    .select(MESSAGE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("sent_at", { ascending: true })
    .limit(200);
  const [messages, threadReplies, templates, agencies] = await Promise.all([
    (reply.thread_id
      ? messagesQuery.or(`thread_id.eq.${reply.thread_id},id.eq.${reply.id}`)
      : messagesQuery.eq("id", reply.id)
    ).returns<ThreadMessage[]>(),
    reply.thread_id
      ? supabase
          .from("campaign_replies")
          .select(REPLY_COLUMNS)
          .eq("workspace_id", workspaceId)
          .eq("thread_id", reply.thread_id)
          .order("received_at", { ascending: true })
          .returns<InboxReply[]>()
      : Promise.resolve({ data: [reply] }),
    supabase
      .from("reply_templates")
      .select("id, name, subject, body_html")
      .eq("workspace_id", workspaceId)
      .order("name")
      .returns<ReplyTemplate[]>(),
    agenciesForEmails(supabase, workspaceId, [reply.lead_email_normalized]),
  ]);

  let thread = messages.data ?? [];
  if (!thread.some((m) => m.id === reply.id)) {
    // Not saved yet (e.g. Instantly unreachable): show what the list knows.
    thread = [
      ...thread,
      {
        id: reply.id,
        direction: "received" as const,
        eaccount: reply.eaccount,
        from_email: reply.lead_email,
        to_emails: reply.eaccount,
        cc_emails: null,
        subject: reply.subject,
        body_html: null,
        body_text: reply.preview,
        is_auto_reply: reply.is_auto_reply,
        step: reply.step,
        sent_at: reply.received_at,
        sent_by: null,
      },
    ].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  }

  // Names of the team members who sent replies from here.
  const senderIds = [
    ...new Set(thread.map((m) => m.sent_by).filter(Boolean)),
  ] as string[];
  const senders = new Map<string, string>();
  if (senderIds.length) {
    const { data } = await createAdminClient()
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", senderIds);
    for (const p of data ?? [])
      senders.set(p.user_id as string, (p.full_name || p.email) as string);
  }

  return {
    workspaceId,
    reply,
    thread,
    threadReplies: threadReplies.data ?? [reply],
    templates: templates.data ?? [],
    agency: agencies.get(reply.lead_email_normalized) ?? null,
    senders,
    notice,
  };
}

// Sending -------------------------------------------------------------------------------

/** Saves an email we just sent, so it shows in the conversation at once. */
export async function saveSentMessage(
  workspaceId: string,
  sent: InstantlyEmail | null,
  fallback: {
    threadId: string | null;
    lead: string;
    eaccount: string;
    subject: string;
    html: string;
    text: string;
    cc?: string;
    userId: string;
  },
) {
  const admin = createAdminClient();
  if (sent?.id) {
    const row = messageRow(workspaceId, sent, fallback);
    await admin.from("campaign_messages").upsert(
      {
        ...row,
        direction: "sent",
        eaccount: row.eaccount ?? fallback.eaccount,
        from_email: row.from_email ?? fallback.eaccount,
        to_emails: row.to_emails ?? fallback.lead,
        cc_emails: row.cc_emails ?? fallback.cc ?? null,
        subject: row.subject ?? fallback.subject,
        body_html: row.body_html ?? fallback.html,
        body_text: row.body_text ?? fallback.text,
        sent_by: fallback.userId,
      },
      { onConflict: "id" },
    );
  }
  // Read the whole thread again next time (also picks up Instantly's copy).
  if (fallback.threadId) {
    await admin
      .from("campaign_threads")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("thread_id", fallback.threadId);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getUserId } from "@/lib/auth/session";
import { requireWorkspace } from "@/lib/auth/workspace";
import { saveSentMessage } from "@/lib/inbox";
import { rememberSendPermission } from "@/lib/send-permission";
import {
  InstantlyError,
  markThreadRead,
  READ_ONLY_KEY_MESSAGE,
  replyToEmail,
  updateLeadInterest,
} from "@/lib/instantly-api";
import { createClient } from "@/lib/supabase/server";
import { fillVariables, htmlToText } from "@/lib/email-content";

export type ActionResult =
  { ok: true; id?: string } | { ok: false; error: string };

function refreshInbox(replyId?: string) {
  revalidatePath("/campaigns/replies");
  revalidatePath("/templates");
  if (replyId) revalidatePath(`/campaigns/replies/${replyId}`);
}

function failure(error: unknown): ActionResult {
  if (error instanceof InstantlyError) {
    if (error.message === READ_ONLY_KEY_MESSAGE) rememberSendPermission(false);
    return { ok: false, error: error.message };
  }
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}

/** Mark a reply as done (the team dealt with it) or open it again. */
export async function setReplyHandled(id: string, done: boolean) {
  await requireWorkspace();
  const supabase = await createClient();
  const { data: reply } = await supabase
    .from("campaign_replies")
    .select("thread_id")
    .eq("id", id)
    .maybeSingle<{ thread_id: string | null }>();
  const { error } = await supabase.rpc("set_reply_handled", {
    p_id: id,
    p_done: done,
  });
  if (error) throw new Error(error.message);
  // Keep Instantly's Unibox in step (needs a key that may change emails).
  if (done && reply?.thread_id) {
    await markThreadRead(reply.thread_id).catch(() => {});
  }
  refreshInbox(id);
}

const emailList = z
  .string()
  .max(2000)
  .transform((value) =>
    value
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.email("Check the CC / BCC addresses")).max(20));

const sendSchema = z.object({
  replyId: z.string().min(1).max(100),
  subject: z
    .string()
    .trim()
    .min(1, "Please enter a subject")
    .max(300, "The subject is too long"),
  html: z.string().max(200_000, "The message is too long"),
  text: z.string().max(200_000, "The message is too long"),
  cc: emailList,
  bcc: emailList,
});

/** Sends a reply to the lead through Instantly, from the account that got the reply. */
export async function sendReply(input: {
  replyId: string;
  subject: string;
  html: string;
  text: string;
  cc: string;
  bcc: string;
}): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the reply.",
    };
  }
  const { replyId, subject, cc, bcc } = parsed.data;
  if (!parsed.data.text.trim() && !/<img/i.test(parsed.data.html)) {
    return { ok: false, error: "Please write a message." };
  }

  const supabase = await createClient();
  const { data: reply } = await supabase
    .from("campaign_replies")
    .select("id, lead_email, lead_email_normalized, eaccount, thread_id")
    .eq("id", replyId)
    .maybeSingle<{
      id: string;
      lead_email: string;
      lead_email_normalized: string;
      eaccount: string | null;
      thread_id: string | null;
    }>();
  if (!reply) return { ok: false, error: "This reply no longer exists." };
  if (!reply.eaccount) {
    return {
      ok: false,
      error: "It is not known which of our accounts got this reply.",
    };
  }

  // Answer the newest email the lead sent in this conversation.
  let target = reply.id;
  if (reply.thread_id) {
    const { data: latest } = await supabase
      .from("campaign_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("thread_id", reply.thread_id)
      .eq("direction", "received")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (latest) target = latest.id;
  }

  // {{firstName}} and the other variables, from our contact and agency data.
  const { data: contact } = await supabase
    .from("agency_contacts")
    .select("full_name, agencies(name)")
    .eq("workspace_id", workspaceId)
    .eq("email_normalized", reply.lead_email_normalized)
    .limit(1)
    .maybeSingle<{
      full_name: string | null;
      agencies: { name: string } | null;
    }>();
  const values = {
    fullName: contact?.full_name ?? "",
    companyName: contact?.agencies?.name ?? "",
    email: reply.lead_email,
    senderEmail: reply.eaccount,
  };
  const html = fillVariables(parsed.data.html, values, { html: true });
  const text =
    fillVariables(parsed.data.text, values, { html: false }) ||
    htmlToText(html);
  const finalSubject = fillVariables(subject, values, { html: false });

  try {
    const sent = await replyToEmail({
      replyToId: target,
      eaccount: reply.eaccount,
      subject: finalSubject,
      html,
      text,
      cc: cc.join(","),
      bcc: bcc.join(","),
    });
    rememberSendPermission(true);
    const userId = (await getUserId())!;
    await saveSentMessage(workspaceId, sent, {
      threadId: reply.thread_id,
      lead: reply.lead_email,
      eaccount: reply.eaccount,
      subject: finalSubject,
      html,
      text,
      cc: cc.join(", ") || undefined,
      userId,
    });
  } catch (error) {
    return failure(error);
  }

  // Answered: this reply and any other open one of the conversation are done.
  const { data: open } = reply.thread_id
    ? await supabase
        .from("campaign_replies")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("thread_id", reply.thread_id)
        .is("replied_at", null)
    : { data: [{ id: reply.id }] };
  for (const row of open ?? []) {
    await supabase.rpc("mark_reply_sent", { p_id: row.id });
  }
  refreshInbox(reply.id);
  return { ok: true };
}

/** Sets the lead's status (Interested, Not interested, …) here and in Instantly. */
export async function setLeadInterest(
  replyId: string,
  status: number | null,
): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  if (status !== null && !(Number.isInteger(status) && Math.abs(status) <= 4)) {
    return { ok: false, error: "Unknown status." };
  }
  const supabase = await createClient();
  const { data: reply } = await supabase
    .from("campaign_replies")
    .select("lead_email, campaign_id")
    .eq("id", replyId)
    .maybeSingle<{ lead_email: string; campaign_id: string | null }>();
  if (!reply) return { ok: false, error: "This reply no longer exists." };
  try {
    await updateLeadInterest(reply.lead_email, status, reply.campaign_id);
  } catch (error) {
    return failure(error);
  }
  const { error } = await supabase.rpc("set_lead_interest", {
    p_workspace_id: workspaceId,
    p_lead_email: reply.lead_email,
    p_status: status,
  });
  if (error) return { ok: false, error: error.message };
  refreshInbox(replyId);
  return { ok: true };
}

const templateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please name the template")
    .max(100, "The name is too long"),
  subject: z.string().trim().max(300).optional(),
  html: z
    .string()
    .min(1, "The template is empty")
    .max(200_000, "The template is too long"),
});

/** Saves the current message as a reusable template for the whole team. */
export async function saveReplyTemplate(input: {
  name: string;
  subject?: string;
  html: string;
}): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid template.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reply_templates")
    .insert({
      workspace_id: workspaceId,
      name: parsed.data.name,
      subject: parsed.data.subject || null,
      body_html: parsed.data.html,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  refreshInbox();
  return { ok: true, id: data.id };
}

/** Changes a saved template (name, subject, message). */
export async function updateReplyTemplate(input: {
  id: string;
  name: string;
  subject?: string;
  html: string;
}): Promise<ActionResult> {
  await requireWorkspace();
  if (!z.uuid().safeParse(input.id).success)
    return { ok: false, error: "Unknown template." };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid template.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reply_templates")
    .update({
      name: parsed.data.name,
      subject: parsed.data.subject || null,
      body_html: parsed.data.html,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Unknown template." };
  refreshInbox();
  revalidatePath("/templates");
  return { ok: true };
}

export async function deleteReplyTemplate(id: string): Promise<ActionResult> {
  await requireWorkspace();
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Unknown template." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("reply_templates")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refreshInbox();
  return { ok: true };
}

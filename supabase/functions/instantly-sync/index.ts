// Instantly -> Scrap&Mail sync (Supabase Edge Function, Deno).
//
// Called in two ways, both with the header "x-scrapmail-secret":
//   * by Instantly's webhook (any event): bounces and unsubscribes are saved at
//     once; a reply starts a quick reply sync.
//   * every 2 minutes by pg_cron (body {"source":"cron"}): the full backup sync of
//     replies, bounces, unsubscribes and the list of Instantly leads.
// The work runs in the background (EdgeRuntime.waitUntil), so callers get an
// answer immediately.
//
// Secrets (supabase secrets set): INSTANTLY_API_KEY, SYNC_SECRET, WORKSPACE_ID,
// SERVICE_KEY (database key that bypasses row level security).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const API = "https://api.instantly.ai/api/v2";
const INSTANTLY_KEY = Deno.env.get("INSTANTLY_API_KEY") ?? "";
const SECRET = Deno.env.get("SYNC_SECRET") ?? "";
const WORKSPACE = Deno.env.get("WORKSPACE_ID") ?? "";
const db: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

/** Pages of Instantly leads scanned per run (100 leads each). */
const LEAD_PAGES_PER_RUN = 20;

// Instantly API --------------------------------------------------------------------

async function instantly<T>(
  path: string,
  init: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: init.body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${INSTANTLY_KEY}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Instantly ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

type Email = {
  id: string;
  timestamp_created: string;
  timestamp_email?: string;
  subject?: string;
  from_address_email?: string | null;
  campaign_id?: string | null;
  lead?: string | null;
  eaccount?: string;
  step?: string | null;
  is_auto_reply?: number | null;
  i_status?: number | null;
  thread_id?: string | null;
  content_preview?: string | null;
};

type Lead = {
  id: string;
  email?: string | null;
  campaign?: string | null;
  timestamp_last_contact?: string | null;
  timestamp_updated?: string;
};

async function campaignNames() {
  const names = new Map<string, string>();
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await instantly<{ items: { id: string; name: string }[]; next_starting_after?: string }>(
      "/campaigns",
      { query: { limit: 100, starting_after: after } },
    );
    for (const c of res.items) names.set(c.id, c.name);
    if (!res.next_starting_after || res.items.length < 100) break;
    after = res.next_starting_after;
  }
  return names;
}

// Sync steps -----------------------------------------------------------------------

async function state() {
  const { data } = await db
    .from("instantly_sync_state")
    .select("*")
    .eq("workspace_id", WORKSPACE)
    .maybeSingle();
  return data as {
    replies_cursor: string | null;
    leads_cursor: string | null;
    running_since: string | null;
  } | null;
}

async function saveState(fields: Record<string, unknown>) {
  const { error } = await db
    .from("instantly_sync_state")
    .upsert({ workspace_id: WORKSPACE, ...fields, updated_at: new Date().toISOString() });
  if (error) throw new Error(`state: ${error.message}`);
}

/** New emails that leads sent back, since the last synced one (with 15 min overlap). */
async function syncReplies(names: Map<string, string>) {
  const cursor = (await state())?.replies_cursor;
  const since = cursor ? new Date(Date.parse(cursor) - 15 * 60_000).toISOString() : undefined;
  let newest = cursor ?? null;
  let after: string | undefined;
  let saved = 0;
  for (let page = 0; page < 50; page++) {
    const res = await instantly<{ items: Email[]; next_starting_after?: string }>("/emails", {
      query: {
        email_type: "received",
        limit: 100,
        sort_order: "asc",
        min_timestamp_created: since,
        starting_after: after,
      },
    });
    // The list leaves out is_auto_reply: read it from each new email once.
    const withLead = res.items.filter((e) => e.lead);
    const { data: known } = withLead.length
      ? await db.from("campaign_replies").select("id, is_auto_reply").in("id", withLead.map((e) => e.id))
      : { data: [] };
    const knownAuto = new Map((known ?? []).map((k) => [k.id as string, k.is_auto_reply as boolean]));
    for (const e of withLead) {
      if (knownAuto.has(e.id)) {
        e.is_auto_reply = knownAuto.get(e.id) ? 1 : 0;
        continue;
      }
      try {
        const full = await instantly<Email>(`/emails/${encodeURIComponent(e.id)}`);
        e.is_auto_reply = full.is_auto_reply ?? 0;
        e.i_status = full.i_status ?? e.i_status;
      } catch {
        // keep the list values
      }
    }
    const rows = withLead
      .map((e) => ({
        id: e.id,
        workspace_id: WORKSPACE,
        campaign_id: e.campaign_id ?? null,
        campaign_name: e.campaign_id ? (names.get(e.campaign_id) ?? null) : null,
        lead_email: e.lead!,
        eaccount: e.eaccount ?? null,
        from_email: e.from_address_email ?? null,
        subject: e.subject ?? null,
        preview: e.content_preview ?? null,
        thread_id: e.thread_id ?? null,
        step: e.step ?? null,
        is_auto_reply: e.is_auto_reply === 1,
        interest_status: e.i_status ?? null,
        received_at: e.timestamp_email ?? e.timestamp_created,
        synced_at: new Date().toISOString(),
      }));
    if (rows.length) {
      const { error } = await db.from("campaign_replies").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`replies: ${error.message}`);
      saved += rows.length;
    }
    for (const e of res.items) {
      if (!newest || e.timestamp_created > newest) newest = e.timestamp_created;
    }
    if (!res.next_starting_after || res.items.length < 100) break;
    after = res.next_starting_after;
  }
  if (newest && newest !== cursor) await saveState({ replies_cursor: newest });
  return saved;
}

/** The sending account of the email a lead got in a campaign (for bounces). */
async function sendingAccount(lead: string, campaignId: string | null) {
  try {
    const res = await instantly<{ items: Email[] }>("/emails", {
      query: { lead, email_type: "sent", campaign_id: campaignId ?? undefined, limit: 1, preview_only: true },
    });
    return res.items[0]?.eaccount ?? null;
  } catch {
    return null;
  }
}

/** Bounced or unsubscribed leads in Instantly that are not saved yet. */
async function syncLeadEvents(kind: "bounced" | "unsubscribed", names: Map<string, string>) {
  const filter = kind === "bounced" ? "FILTER_VAL_BOUNCED" : "FILTER_VAL_UNSUBSCRIBED";
  const leads: Lead[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await instantly<{ items: Lead[]; next_starting_after?: string }>("/leads/list", {
      body: { filter, limit: 100, starting_after: after },
    });
    leads.push(...res.items.filter((l) => l.email));
    if (!res.next_starting_after || res.items.length < 100) break;
    after = res.next_starting_after;
  }
  if (!leads.length) return 0;

  const { data: known } = await db
    .from("campaign_lead_events")
    .select("campaign_id, lead_email_normalized")
    .eq("workspace_id", WORKSPACE)
    .eq("kind", kind);
  const seen = new Set((known ?? []).map((k) => `${k.campaign_id}|${k.lead_email_normalized}`));
  const fresh = leads.filter(
    (l) => !seen.has(`${l.campaign ?? ""}|${l.email!.trim().toLowerCase()}`),
  );

  const rows = [];
  for (const l of fresh) {
    rows.push({
      workspace_id: WORKSPACE,
      kind,
      campaign_id: l.campaign ?? "",
      campaign_name: l.campaign ? (names.get(l.campaign) ?? null) : null,
      lead_email: l.email!.trim(),
      eaccount: kind === "bounced" ? await sendingAccount(l.email!.trim(), l.campaign ?? null) : null,
      occurred_at: l.timestamp_last_contact ?? l.timestamp_updated ?? new Date().toISOString(),
      source: "sync",
    });
  }
  if (rows.length) {
    const { error } = await db.from("campaign_lead_events").upsert(rows, {
      onConflict: "workspace_id,kind,campaign_id,lead_email_normalized",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`${kind}: ${error.message}`);
  }
  return rows.length;
}

/** Part of Instantly's lead list per run: their addresses count as used (level >= 1). */
async function syncInstantlyLeads() {
  let after = (await state())?.leads_cursor ?? undefined;
  let marked = 0;
  for (let page = 0; page < LEAD_PAGES_PER_RUN; page++) {
    const res = await instantly<{ items: Lead[]; next_starting_after?: string }>("/leads/list", {
      body: { limit: 100, starting_after: after },
    });
    const emails = res.items.map((l) => l.email).filter((e): e is string => Boolean(e));
    if (emails.length) {
      const { data, error } = await db.rpc("mark_instantly_leads", {
        p_workspace_id: WORKSPACE,
        p_emails: emails,
      });
      if (error) throw new Error(`leads: ${error.message}`);
      marked += Number(data ?? 0);
    }
    if (!res.next_starting_after || res.items.length < 100) {
      after = undefined; // reached the end: start again next run
      break;
    }
    after = res.next_starting_after;
  }
  await saveState({ leads_cursor: after ?? null });
  return marked;
}

async function fullSync() {
  const current = await state();
  if (
    current?.running_since &&
    Date.now() - Date.parse(current.running_since) < 5 * 60_000
  ) {
    return { skipped: "a sync is already running" };
  }
  await saveState({ running_since: new Date().toISOString() });
  try {
    const names = await campaignNames();
    const replies = await syncReplies(names);
    const bounced = await syncLeadEvents("bounced", names);
    const unsubscribed = await syncLeadEvents("unsubscribed", names);
    const leads = await syncInstantlyLeads();
    await saveState({ running_since: null, last_sync_at: new Date().toISOString(), last_error: null });
    return { replies, bounced, unsubscribed, leads };
  } catch (error) {
    await saveState({ running_since: null, last_error: String(error).slice(0, 500) });
    throw error;
  }
}

// Webhook events --------------------------------------------------------------------

type WebhookEvent = {
  event_type?: string;
  timestamp?: string;
  campaign_id?: string;
  campaign_name?: string;
  lead_email?: string;
  email_account?: string;
  unibox_url?: string;
};

async function handleEvent(event: WebhookEvent) {
  await saveState({ last_webhook_at: new Date().toISOString() });
  const type = event.event_type ?? "";
  if ((type === "email_bounced" || type === "lead_unsubscribed") && event.lead_email) {
    const { error } = await db.from("campaign_lead_events").upsert(
      {
        workspace_id: WORKSPACE,
        kind: type === "email_bounced" ? "bounced" : "unsubscribed",
        campaign_id: event.campaign_id ?? "",
        campaign_name: event.campaign_name ?? null,
        lead_email: event.lead_email.trim(),
        eaccount: event.email_account ?? null,
        occurred_at: event.timestamp ?? new Date().toISOString(),
        source: "webhook",
      },
      { onConflict: "workspace_id,kind,campaign_id,lead_email_normalized", ignoreDuplicates: true },
    );
    if (error) throw new Error(`event: ${error.message}`);
    return { saved: type };
  }
  if (type === "reply_received" || type === "auto_reply_received" || type === "lead_out_of_office") {
    const names = new Map<string, string>();
    if (event.campaign_id && event.campaign_name) names.set(event.campaign_id, event.campaign_name);
    const replies = await syncReplies(names.size ? names : await campaignNames());
    // Keep Instantly's link to the conversation on the newest reply of this lead.
    if (event.unibox_url && event.lead_email) {
      const { data: latest } = await db
        .from("campaign_replies")
        .select("id")
        .eq("workspace_id", WORKSPACE)
        .eq("lead_email_normalized", event.lead_email.trim().toLowerCase())
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        await db.from("campaign_replies").update({ unibox_url: event.unibox_url }).eq("id", latest.id);
      }
    }
    return { replies };
  }
  return { ignored: type || "unknown event" };
}

// Entry point ------------------------------------------------------------------------

function sameSecret(given: string | null) {
  if (!SECRET || !given || given.length !== SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < SECRET.length; i++) diff |= SECRET.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // The secret comes as a header, or as ?key=… in the URL (for webhook forms
  // that cannot add headers).
  const given = req.headers.get("x-scrapmail-secret") ?? new URL(req.url).searchParams.get("key");
  if (!sameSecret(given)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!INSTANTLY_KEY || !WORKSPACE) {
    return new Response("Not configured", { status: 500 });
  }
  const body = (await req.json().catch(() => ({}))) as WebhookEvent & { source?: string; wait?: boolean };
  const run = body.event_type ? handleEvent(body) : fullSync();
  // {"wait": true} (manual test): answer only when the work is done, with its result.
  if (body.wait) {
    try {
      return Response.json({ ok: true, result: await run });
    } catch (error) {
      return Response.json({ ok: false, error: String(error) }, { status: 500 });
    }
  }
  EdgeRuntime.waitUntil(
    run.then(
      (result) => console.log(JSON.stringify({ event: body.event_type ?? body.source ?? "sync", result })),
      (error) => console.error(String(error)),
    ),
  );
  return Response.json({ ok: true }, { status: 202 });
});

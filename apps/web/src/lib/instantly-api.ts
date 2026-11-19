import "server-only";

/**
 * Read-only client for the Instantly API v2 (https://developer.instantly.ai).
 * The key lives in INSTANTLY_API_KEY on the server and never reaches the browser.
 * A key with the `all:read` scope is enough for everything used here.
 */

const BASE = "https://api.instantly.ai/api/v2";

export function instantlyConfigured() {
  return Boolean(process.env.INSTANTLY_API_KEY?.trim());
}

export class InstantlyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * Answers are shared for this long: every open page refreshes when Instantly reports
 * a change, and they all get the same answer from one request (fast pages, and far
 * below Instantly's rate limit). Requests in flight are shared too.
 */
const CACHE_MS = 2000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function get<T>(path: string, query: Query = {}): Promise<T> {
  const key = `${path}?${new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  )}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value as Promise<T>;
  if (cache.size > 200) {
    for (const [k, v] of cache) if (now - v.at >= CACHE_MS) cache.delete(k);
  }
  const value = fetchInstantly<T>(path, query);
  cache.set(key, { at: now, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key); // never keep errors
  });
  return value;
}

/** The key may only read: sending needs a key with the all:all scope. */
export const READ_ONLY_KEY_MESSAGE =
  "The Instantly API key can only read data. To reply from Scrap&Mail, create an Instantly API key with the all:all scope and put it in INSTANTLY_API_KEY.";

async function fetchInstantly<T>(
  path: string,
  query: Query,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const key = process.env.INSTANTLY_API_KEY?.trim();
  if (!key) throw new InstantlyError("Instantly is not connected.", 0);
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new InstantlyError("Instantly did not answer. Please try again.", 0);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const message = /invalid scope/i.test(detail)
      ? READ_ONLY_KEY_MESSAGE
      : res.status === 401 || res.status === 403
        ? "Instantly refused the API key. Check that it is correct and has read access."
        : res.status === 404
          ? "Not found in Instantly."
          : res.status === 429
            ? "Too many requests to Instantly. Please try again in a minute."
            : res.status === 400
              ? `Instantly could not do this: ${errorText(detail)}`
              : `Instantly answered with an error (${res.status}).`;
    throw new InstantlyError(message, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** The error message in an Instantly error answer. */
function errorText(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return parsed.message.slice(0, 300);
  } catch {
    // not JSON
  }
  return body.slice(0, 300) || "unknown error";
}

/** A request that changes something in Instantly (never cached). */
function post<T>(path: string, body: unknown) {
  return fetchInstantly<T>(path, {}, { method: "POST", body });
}

// Campaigns ---------------------------------------------------------------------

export type CampaignStatus = -99 | -2 | -1 | 0 | 1 | 2 | 3 | 4;

export const CAMPAIGN_STATUS: Record<
  number,
  { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }
> = {
  1: { label: "Active", tone: "success" },
  2: { label: "Paused", tone: "warning" },
  3: { label: "Completed", tone: "info" },
  4: { label: "Running subsequences", tone: "success" },
  0: { label: "Draft", tone: "neutral" },
  [-1]: { label: "Accounts unhealthy", tone: "danger" },
  [-2]: { label: "Bounce protect", tone: "danger" },
  [-99]: { label: "Account suspended", tone: "danger" },
};

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  open_tracking?: boolean | null;
  link_tracking?: boolean | null;
  daily_limit?: number | null;
  stop_on_reply?: boolean | null;
  timestamp_created: string;
  timestamp_updated?: string;
};

/** Every campaign in the workspace, newest first. */
export async function listCampaigns(): Promise<Campaign[]> {
  const all: Campaign[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await get<{ items: Campaign[]; next_starting_after?: string }>(
      "/campaigns",
      {
        limit: 100,
        starting_after: after,
        sort_column: "timestamp_created",
        sort_order: "desc",
      },
    );
    all.push(...res.items);
    if (!res.next_starting_after || res.items.length < 100) break;
    after = res.next_starting_after;
  }
  return all;
}

export function getCampaign(id: string) {
  return get<Campaign>(`/campaigns/${encodeURIComponent(id)}`);
}

// Analytics ----------------------------------------------------------------------

export type CampaignAnalytics = {
  campaign_id: string;
  campaign_name: string;
  campaign_status: number;
  leads_count: number;
  contacted_count: number;
  emails_sent_count: number;
  new_leads_contacted_count: number;
  open_count_unique: number;
  reply_count: number;
  reply_count_unique: number;
  reply_count_automatic: number;
  link_click_count_unique: number;
  bounced_count: number;
  unsubscribed_count: number;
  completed_count: number;
  total_opportunities: number;
  total_opportunity_value: number;
};

export type DateRange = { start?: string; end?: string };

/** Totals per campaign (all campaigns when `id` is not given). */
export function campaignAnalytics({
  id,
  start,
  end,
}: DateRange & { id?: string } = {}) {
  return get<CampaignAnalytics[]>("/campaigns/analytics", {
    id,
    start_date: start,
    end_date: end,
  });
}

export type DailyAnalytics = {
  date: string;
  sent: number;
  contacted: number;
  unique_opened: number;
  replies: number;
  unique_replies: number;
  /** Out-of-office and other automatic replies (Instantly's charts include them). */
  unique_replies_automatic: number;
  unique_clicks: number;
  opportunities: number;
};

export function dailyAnalytics(campaignId: string, { start, end }: DateRange) {
  return get<DailyAnalytics[]>("/campaigns/analytics/daily", {
    campaign_id: campaignId,
    start_date: start,
    end_date: end,
  });
}

export type StepAnalytics = {
  step: string | null;
  variant: string | null;
  sent: number;
  unique_opened: number;
  replies: number;
  unique_replies: number;
  unique_replies_automatic: number;
  unique_clicks: number;
  opportunities?: number;
  meetings_booked?: number;
  won?: number;
};

export function stepAnalytics(campaignId: string, { start, end }: DateRange) {
  return get<StepAnalytics[]>("/campaigns/analytics/steps", {
    campaign_id: campaignId,
    start_date: start,
    end_date: end,
    include_opportunities_count: true,
  });
}

/** Link to the campaign in Instantly's app. */
export function instantlyCampaignUrl(id: string) {
  return `https://app.instantly.ai/app/campaign/${encodeURIComponent(id)}/analytics`;
}

// Emails (replies) -----------------------------------------------------------------

export type InstantlyEmail = {
  id: string;
  timestamp_created: string;
  timestamp_email?: string | null;
  subject?: string | null;
  from_address_email?: string | null;
  to_address_email_list?: string | null;
  cc_address_email_list?: string | null;
  body?: { html?: string | null; text?: string | null } | null;
  campaign_id?: string | null;
  lead?: string | null;
  eaccount?: string | null;
  /** 1 sent by a campaign, 2 received, 3 sent by hand, 4 scheduled. */
  ue_type?: number | null;
  step?: string | null;
  is_auto_reply?: number | null;
  thread_id?: string | null;
  content_preview?: string | null;
};

/**
 * Every email of a conversation, oldest first. Instantly allows 20 of these
 * requests per minute, so callers keep the result (see lib/inbox.ts).
 */
export async function threadEmails(threadId: string) {
  const res = await fetchInstantly<{ items: InstantlyEmail[] }>("/emails", {
    search: `thread:${threadId}`,
    limit: 100,
    sort_order: "asc",
    preview_only: false,
  });
  return res.items;
}

/** Sends a reply in a conversation (needs a key that may send). */
export function replyToEmail(input: {
  replyToId: string;
  eaccount: string;
  subject: string;
  html: string;
  text: string;
  cc?: string;
  bcc?: string;
}) {
  return post<InstantlyEmail | null>("/emails/reply", {
    reply_to_uuid: input.replyToId,
    eaccount: input.eaccount,
    subject: input.subject,
    body: { html: input.html, text: input.text },
    ...(input.cc ? { cc_address_email_list: input.cc } : {}),
    ...(input.bcc ? { bcc_address_email_list: input.bcc } : {}),
  });
}

/** Marks every email of a conversation as read in Instantly's Unibox. */
export function markThreadRead(threadId: string) {
  return post<unknown>(
    `/emails/threads/${encodeURIComponent(threadId)}/mark-as-read`,
    {},
  );
}

/** Sets the lead's status in Instantly (this can end or change its campaign there). */
export function updateLeadInterest(
  leadEmail: string,
  status: number | null,
  campaignId?: string | null,
) {
  return post<unknown>("/leads/update-interest-status", {
    lead_email: leadEmail,
    interest_value: status,
    ...(campaignId ? { campaign_id: campaignId } : {}),
  });
}

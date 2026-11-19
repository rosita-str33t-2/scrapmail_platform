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

async function fetchInstantly<T>(path: string, query: Query): Promise<T> {
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
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new InstantlyError("Instantly did not answer. Please try again.", 0);
  }
  if (!res.ok) {
    const message =
      res.status === 401 || res.status === 403
        ? "Instantly refused the API key. Check that it is correct and has read access."
        : res.status === 404
          ? "Not found in Instantly."
          : res.status === 429
            ? "Too many requests to Instantly. The page will refresh shortly."
            : `Instantly answered with an error (${res.status}).`;
    throw new InstantlyError(message, res.status);
  }
  return (await res.json()) as T;
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

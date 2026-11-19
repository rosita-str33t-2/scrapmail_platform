-- Replies and bounces from Instantly.
--   * campaign_replies: every email a lead sent back (from Instantly's Unibox), with the
--     sending account that received it. The team marks replies as done.
--   * campaign_lead_events: bounced and unsubscribed leads per campaign.
--   * email_levels.blocked: an address that bounced or unsubscribed is never exported
--     again. This mark is per address and survives contact clean-ups, re-scrapes and
--     level resets.
--   * email_levels.in_instantly_at: the address is a lead in Instantly. The first time
--     it is seen there, its level goes up to at least 1 (it was already used).
--   * The Edge Function "instantly-sync" fills these tables (webhooks + a backup run
--     every 2 minutes through pg_cron).

-- Blocked addresses and Instantly leads ---------------------------------------------
alter table public.email_levels
  add column blocked         text check (blocked in ('bounced', 'unsubscribed')),
  add column blocked_at      timestamptz,
  add column in_instantly_at timestamptz;

comment on column public.email_levels.blocked is
  'bounced / unsubscribed in Instantly: never exported again (not changed by level resets).';
comment on column public.email_levels.in_instantly_at is
  'First time the address was seen as a lead in Instantly.';

-- The contact list shows whether the address is blocked (new column at the end).
create or replace view public.contact_list
with (security_invoker = true)
as
select c.*, coalesce(l.level, 0) as export_level, l.blocked
from public.agency_contacts c
left join public.email_levels l
  on l.workspace_id = c.workspace_id and l.email_normalized = c.email_normalized;

-- The export never takes a blocked address.
create or replace function public.record_contact_export(
  p_workspace_id uuid,
  p_contact_ids uuid[],
  p_level_min int default null,
  p_level_max int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
  v_ids uuid[];
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_contact_ids), 0) = 0 then
    return jsonb_build_object('batch_id', null, 'contact_ids', '[]'::jsonb);
  end if;
  if cardinality(p_contact_ids) > 100000 then
    raise exception 'at most 100000 emails per export' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('contact_export'), hashtext(p_workspace_id::text));

  create temporary table picked on commit drop as
  select distinct on (c.email_normalized)
         c.id, c.email_normalized, x.ord
  from unnest(p_contact_ids) with ordinality as x (id, ord)
  join public.agency_contacts c on c.id = x.id
  join public.email_levels l
    on l.workspace_id = c.workspace_id and l.email_normalized = c.email_normalized
  where c.workspace_id = p_workspace_id
    and c.email_normalized is not null
    and (c.email_status is null or c.email_status = 'valid')
    and l.blocked is null
    and (p_level_min is null or l.level >= p_level_min)
    and (p_level_max is null or l.level <= p_level_max)
  order by c.email_normalized, x.ord;

  select array_agg(id order by ord) into v_ids from picked;
  if v_ids is null then
    return jsonb_build_object('batch_id', null, 'contact_ids', '[]'::jsonb);
  end if;

  insert into public.contact_exports (workspace_id, created_by, requested, exported)
  values (p_workspace_id, auth.uid(), cardinality(p_contact_ids), cardinality(v_ids))
  returning id into v_batch;

  insert into public.contact_export_items (batch_id, contact_id, position)
  select v_batch, id, row_number() over (order by ord) from picked;

  update public.email_levels l
     set level = l.level + 1, updated_at = now()
    from picked p
   where l.workspace_id = p_workspace_id and l.email_normalized = p.email_normalized;

  return jsonb_build_object('batch_id', v_batch, 'contact_ids', to_jsonb(v_ids));
end;
$$;

-- Replies ----------------------------------------------------------------------------
create table public.campaign_replies (
  id                     text primary key,            -- Instantly email id
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  campaign_id            text,
  campaign_name          text,
  lead_email             text not null,
  lead_email_normalized  text generated always as (lower(btrim(lead_email))) stored,
  eaccount               text,                        -- our sending account that received it
  from_email             text,
  subject                text,
  preview                text,
  thread_id              text,
  step                   text,
  is_auto_reply          boolean not null default false,
  interest_status        int,
  unibox_url             text,
  received_at            timestamptz not null,
  synced_at              timestamptz not null default now(),
  handled_at             timestamptz,
  handled_by             uuid references auth.users (id) on delete set null
);

comment on table public.campaign_replies is
  'Emails leads sent back to Instantly campaigns (synced from Instantly). handled_at: the team dealt with it.';

create index campaign_replies_inbox_idx
  on public.campaign_replies (workspace_id, received_at desc);
create index campaign_replies_open_idx
  on public.campaign_replies (workspace_id, received_at desc)
  where handled_at is null and not is_auto_reply;
create index campaign_replies_campaign_idx on public.campaign_replies (campaign_id, received_at desc);
create index campaign_replies_lead_idx on public.campaign_replies (workspace_id, lead_email_normalized);

-- Bounces and unsubscribes -----------------------------------------------------------
create table public.campaign_lead_events (
  id                     bigint generated always as identity primary key,
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  kind                   text not null check (kind in ('bounced', 'unsubscribed')),
  campaign_id            text not null default '',
  campaign_name          text,
  lead_email             text not null,
  lead_email_normalized  text generated always as (lower(btrim(lead_email))) stored,
  eaccount               text,                        -- our sending account
  occurred_at            timestamptz not null,
  source                 text not null check (source in ('webhook', 'sync')),
  created_at             timestamptz not null default now(),
  unique (workspace_id, kind, campaign_id, lead_email_normalized)
);

comment on table public.campaign_lead_events is
  'Leads that bounced or unsubscribed in an Instantly campaign.';

create index campaign_lead_events_list_idx
  on public.campaign_lead_events (workspace_id, kind, occurred_at desc);

-- A bounce or unsubscribe blocks the address for good.
create function private.block_email_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_levels (workspace_id, email_normalized, blocked, blocked_at)
  values (new.workspace_id, new.lead_email_normalized, new.kind, new.occurred_at)
  on conflict (workspace_id, email_normalized) do update
    set blocked = coalesce(public.email_levels.blocked, excluded.blocked),
        blocked_at = coalesce(public.email_levels.blocked_at, excluded.blocked_at),
        updated_at = now();
  return new;
end;
$$;

revoke all on function private.block_email_from_event() from public;

create trigger campaign_lead_events_block
  after insert on public.campaign_lead_events
  for each row execute function private.block_email_from_event();

-- Sync state ---------------------------------------------------------------------------
create table public.instantly_sync_state (
  workspace_id     uuid primary key references public.workspaces (id) on delete cascade,
  replies_cursor   timestamptz,          -- newest reply already synced
  leads_cursor     text,                 -- where the scan of Instantly leads continues
  running_since    timestamptz,          -- a full sync is running (lock)
  last_sync_at     timestamptz,
  last_webhook_at  timestamptz,
  last_error       text,
  updated_at       timestamptz not null default now()
);

-- Access ------------------------------------------------------------------------------
alter table public.campaign_replies enable row level security;
alter table public.campaign_lead_events enable row level security;
alter table public.instantly_sync_state enable row level security;

create policy "campaign_replies: workspace members" on public.campaign_replies
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));
create policy "campaign_lead_events: workspace members" on public.campaign_lead_events
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));
create policy "instantly_sync_state: workspace members" on public.instantly_sync_state
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

grant select on public.campaign_replies, public.campaign_lead_events, public.instantly_sync_state
  to authenticated;

-- Mark a reply as done (or open again).
create function public.set_reply_handled(p_id text, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace from public.campaign_replies where id = p_id;
  if v_workspace is null or not private.is_workspace_member(v_workspace) then
    raise exception 'reply not found' using errcode = 'P0002';
  end if;
  update public.campaign_replies
     set handled_at = case when p_done then now() end,
         handled_by = case when p_done then auth.uid() end
   where id = p_id;
end;
$$;

revoke all on function public.set_reply_handled(text, boolean) from public, anon;
grant execute on function public.set_reply_handled(text, boolean) to authenticated;

-- Addresses that are leads in Instantly (called by the sync with the service key):
-- first time seen -> in_instantly_at, and level at least 1.
create function public.mark_instantly_leads(p_workspace_id uuid, p_emails text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.email_levels (workspace_id, email_normalized, level, in_instantly_at)
  select distinct p_workspace_id, lower(btrim(e)), 1, now()
  from unnest(p_emails) as e
  where e is not null and btrim(e) <> ''
  on conflict (workspace_id, email_normalized) do update
    set in_instantly_at = now(),
        level = greatest(public.email_levels.level, 1),
        updated_at = now()
    where public.email_levels.in_instantly_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_instantly_leads(uuid, text[]) from public, anon, authenticated;

-- Backup sync every 2 minutes ----------------------------------------------------------
-- Calls the Edge Function with the URL and secret kept in Vault ("instantly_sync_url",
-- "instantly_sync_secret"); does nothing until both are stored.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'instantly-sync',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'instantly_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scrapmail-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'instantly_sync_secret')
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'instantly_sync_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'instantly_sync_secret');
  $$
);

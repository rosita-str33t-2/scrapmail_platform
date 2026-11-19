-- Reply inbox and administrator-only export.
--
-- 1. Exporting emails is for platform administrators only. Every export function now
--    checks it first; the original functions move to the private schema, where only
--    these checked wrappers can call them.
-- 2. Conversations: campaign_messages keeps every email of a reply thread (what the
--    lead wrote, what we sent), so a conversation opens from our database instead of
--    asking Instantly each time (its email list allows 20 requests per minute).
--    Written by the server only (Instantly sync and the reply sender); members read.
-- 3. Reply templates the team can reuse in the reply editor.
-- 4. campaign_replies remembers who replied from the platform, and when.

-- 1. Administrator-only export -----------------------------------------------------

create function private.require_export_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'only administrators can export emails' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_export_admin() from public, anon, authenticated;

alter function public.record_contact_export(uuid, uuid[], int, int) set schema private;
alter function public.undo_last_contact_export(uuid) set schema private;
alter function public.reset_email_levels(uuid) set schema private;
alter function public.export_contacts(uuid, integer) set schema private;
alter function public.contact_export_rows(uuid) set schema private;
alter function public.reset_contact_exports(uuid) set schema private;

revoke all on function private.record_contact_export(uuid, uuid[], int, int) from public, anon, authenticated;
revoke all on function private.undo_last_contact_export(uuid) from public, anon, authenticated;
revoke all on function private.reset_email_levels(uuid) from public, anon, authenticated;
revoke all on function private.export_contacts(uuid, integer) from public, anon, authenticated;
revoke all on function private.contact_export_rows(uuid) from public, anon, authenticated;
revoke all on function private.reset_contact_exports(uuid) from public, anon, authenticated;

create function public.record_contact_export(
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
begin
  perform private.require_export_admin();
  return private.record_contact_export(p_workspace_id, p_contact_ids, p_level_min, p_level_max);
end;
$$;

create function public.undo_last_contact_export(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_export_admin();
  return private.undo_last_contact_export(p_workspace_id);
end;
$$;

create function public.reset_email_levels(p_workspace_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_export_admin();
  return private.reset_email_levels(p_workspace_id);
end;
$$;

create function public.export_contacts(p_workspace_id uuid, p_count integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_export_admin();
  return private.export_contacts(p_workspace_id, p_count);
end;
$$;

create function public.contact_export_rows(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_export_admin();
  return private.contact_export_rows(p_batch_id);
end;
$$;

create function public.reset_contact_exports(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_export_admin();
  return private.reset_contact_exports(p_workspace_id);
end;
$$;

revoke all on function public.record_contact_export(uuid, uuid[], int, int) from public, anon;
revoke all on function public.undo_last_contact_export(uuid) from public, anon;
revoke all on function public.reset_email_levels(uuid) from public, anon;
revoke all on function public.export_contacts(uuid, integer) from public, anon;
revoke all on function public.contact_export_rows(uuid) from public, anon;
revoke all on function public.reset_contact_exports(uuid) from public, anon;
grant execute on function public.record_contact_export(uuid, uuid[], int, int) to authenticated;
grant execute on function public.undo_last_contact_export(uuid) to authenticated;
grant execute on function public.reset_email_levels(uuid) to authenticated;
grant execute on function public.export_contacts(uuid, integer) to authenticated;
grant execute on function public.contact_export_rows(uuid) to authenticated;
grant execute on function public.reset_contact_exports(uuid) to authenticated;

-- 2. Conversation messages ---------------------------------------------------------

create table public.campaign_messages (
  id                     text primary key,            -- Instantly email id
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  thread_id              text,
  lead_email             text,
  lead_email_normalized  text generated always as (lower(btrim(lead_email))) stored,
  direction              text not null check (direction in ('received', 'sent')),
  campaign_id            text,
  eaccount               text,                        -- our sending account
  from_email             text,
  to_emails              text,
  cc_emails              text,
  subject                text,
  body_html              text,
  body_text              text,
  is_auto_reply          boolean not null default false,
  step                   text,
  sent_at                timestamptz not null,
  sent_by                uuid references auth.users (id) on delete set null, -- sent from this platform
  synced_at              timestamptz not null default now()
);

comment on table public.campaign_messages is
  'Emails of reply conversations (from Instantly, and replies sent from this platform).';

create index campaign_messages_thread_idx
  on public.campaign_messages (workspace_id, thread_id, sent_at);
create index campaign_messages_lead_idx
  on public.campaign_messages (workspace_id, lead_email_normalized, sent_at);

-- When a thread was last read in full from Instantly (server only).
create table public.campaign_threads (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  thread_id     text not null,
  fetched_at    timestamptz not null,
  primary key (workspace_id, thread_id)
);

alter table public.campaign_replies
  add column replied_at timestamptz,
  add column replied_by uuid references auth.users (id) on delete set null;

-- 3. Reply templates -----------------------------------------------------------------

create table public.reply_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 100),
  subject       text check (char_length(subject) <= 300),
  body_html     text not null check (char_length(body_html) <= 200000),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index reply_templates_workspace_idx on public.reply_templates (workspace_id, name);

-- Access ---------------------------------------------------------------------------------

alter table public.campaign_messages enable row level security;
alter table public.campaign_threads enable row level security;
alter table public.reply_templates enable row level security;

create policy "campaign_messages: workspace members" on public.campaign_messages
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

create policy "reply_templates: workspace members read" on public.reply_templates
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));
create policy "reply_templates: workspace members add" on public.reply_templates
  for insert to authenticated with check (workspace_id in (select private.my_workspace_ids()));
create policy "reply_templates: workspace members change" on public.reply_templates
  for update to authenticated
  using (workspace_id in (select private.my_workspace_ids()))
  with check (workspace_id in (select private.my_workspace_ids()));
create policy "reply_templates: workspace members remove" on public.reply_templates
  for delete to authenticated using (workspace_id in (select private.my_workspace_ids()));

grant select on public.campaign_messages to authenticated;
grant select, insert, update, delete on public.reply_templates to authenticated;

-- A reply was answered from the platform: it counts as handled.
create function public.mark_reply_sent(p_id text)
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
     set replied_at = now(), replied_by = auth.uid(),
         handled_at = coalesce(handled_at, now()),
         handled_by = coalesce(handled_by, auth.uid())
   where id = p_id;
end;
$$;

revoke all on function public.mark_reply_sent(text) from public, anon;
grant execute on function public.mark_reply_sent(text) to authenticated;

-- The lead's interest status (also set in Instantly by the server).
create function public.set_lead_interest(p_workspace_id uuid, p_lead_email text, p_status int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  if p_status is not null and p_status not between -4 and 4 then
    raise exception 'invalid interest status' using errcode = '22023';
  end if;
  update public.campaign_replies
     set interest_status = p_status
   where workspace_id = p_workspace_id
     and lead_email_normalized = lower(btrim(p_lead_email));
end;
$$;

revoke all on function public.set_lead_interest(uuid, text, int) from public, anon;
grant execute on function public.set_lead_interest(uuid, text, int) to authenticated;

-- Live updates: open conversations and template lists refresh when these change.
create trigger live_insert after insert on public.campaign_messages
  referencing new table as changed_rows
  for each statement execute function private.live_change('replies');
create trigger live_update after update on public.campaign_messages
  referencing new table as changed_rows
  for each statement execute function private.live_change('replies');

create trigger live_insert after insert on public.reply_templates
  referencing new table as changed_rows
  for each statement execute function private.live_change('templates');
create trigger live_update after update on public.reply_templates
  referencing new table as changed_rows
  for each statement execute function private.live_change('templates');
create trigger live_delete after delete on public.reply_templates
  referencing old table as changed_rows
  for each statement execute function private.live_change('templates');

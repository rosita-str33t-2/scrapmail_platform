-- Live updates over Supabase Realtime (WebSocket) instead of polling.
--   * When data changes, the database sends a tiny "changed" message (no row data) on a
--     private Realtime channel. Open pages that show that data refresh themselves at
--     once (within about a second).
--   * Channels ("topics"):
--       live:<workspace id>:<kind>   kind = jobs, agencies, contacts, levels, replies,
--                                    bounces, campaigns
--       live:admin:users             account sign-ups and changes (admins only)
--       live:global:workers          scraper worker status (approved users)
--   * At most one message per topic every 750 ms. The pages refresh once more shortly
--     after a message, so changes in between are never missed.
--   * Statement-level triggers: a batch of 1,000 rows sends one message, not 1,000.

-- When each topic last sent a message (unlogged: only a throttle, never needed after
-- a restart).
create unlogged table private.live_signals (
  topic    text primary key,
  sent_at  timestamptz not null
);

revoke all on private.live_signals from public, anon, authenticated;

-- Sends "changed" on a topic, at most once every 750 ms. A writer that finds the row
-- busy skips it (another writer is sending right now), so writers never wait for each
-- other. Live updates must never make a write fail.
create function private.send_live_signal(p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from private.live_signals
  where topic = p_topic
    and sent_at < clock_timestamp() - interval '750 milliseconds'
  for update skip locked;

  if found then
    update private.live_signals set sent_at = clock_timestamp() where topic = p_topic;
  else
    if exists (select 1 from private.live_signals where topic = p_topic) then
      return; -- sent a moment ago, or being sent by another writer
    end if;
    insert into private.live_signals (topic, sent_at)
    values (p_topic, clock_timestamp())
    on conflict do nothing;
    if not found then
      return;
    end if;
  end if;

  perform realtime.send(
    jsonb_build_object('topic', p_topic),
    'changed',
    p_topic,
    true -- private channel: only users allowed by the policy below receive it
  );
exception when others then
  raise warning 'live update for % failed: %', p_topic, sqlerrm;
end;
$$;

revoke all on function private.send_live_signal(text) from public, anon, authenticated;

-- Trigger: one message per workspace touched by the statement.
-- TG_ARGV[0] = kind. The changed rows are in the transition table "changed_rows".
create function private.live_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  for v_workspace in
    select distinct workspace_id from changed_rows where workspace_id is not null
  loop
    perform private.send_live_signal('live:' || v_workspace::text || ':' || tg_argv[0]);
  end loop;
  return null;
end;
$$;

revoke all on function private.live_change() from public, anon, authenticated;

-- Trigger for tables without a workspace: TG_ARGV[0] = the topic.
create function private.live_change_global()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.send_live_signal(tg_argv[0]);
  return null;
end;
$$;

revoke all on function private.live_change_global() from public, anon, authenticated;

-- Workspace tables -> kind. Separate triggers per event (a trigger with a transition
-- table can only have one event).
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('scrape_jobs', 'jobs'),
      ('agencies', 'agencies'),
      ('agency_contacts', 'contacts'),
      ('email_levels', 'levels'),
      ('campaign_replies', 'replies'),
      ('campaign_lead_events', 'bounces')
    ) as v (tbl, kind)
  loop
    execute format(
      'create trigger live_insert after insert on public.%I
         referencing new table as changed_rows
         for each statement execute function private.live_change(%L)',
      t.tbl, t.kind);
    execute format(
      'create trigger live_update after update on public.%I
         referencing new table as changed_rows
         for each statement execute function private.live_change(%L)',
      t.tbl, t.kind);
    execute format(
      'create trigger live_delete after delete on public.%I
         referencing old table as changed_rows
         for each statement execute function private.live_change(%L)',
      t.tbl, t.kind);
  end loop;
end;
$$;

create trigger live_change after insert or update or delete on public.profiles
  for each statement execute function private.live_change_global('live:admin:users');
create trigger live_change after insert or update or delete on public.workspace_members
  for each statement execute function private.live_change_global('live:admin:users');
create trigger live_change after insert or update or delete on public.worker_status
  for each statement execute function private.live_change_global('live:global:workers');

-- For the Instantly sync (service key only): something changed in Instantly
-- (campaign stats, etc.), sent on live:<workspace>:<kind>.
create function public.signal_live_change(p_workspace_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind !~ '^[a-z]+$' then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  perform private.send_live_signal('live:' || p_workspace_id::text || ':' || p_kind);
end;
$$;

revoke all on function public.signal_live_change(uuid, text) from public, anon, authenticated;

-- Who may listen: members to their workspace's topics, admins to account changes,
-- approved users to worker status. Nobody may send from the browser.
-- (realtime.messages is created by the Realtime service; a bare local database, as in
-- CI, does not have it.)
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found: live updates policy skipped';
    return;
  end if;
  execute $policy$
    create policy "live updates: allowed listeners" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (
          (
            split_part((select realtime.topic()), ':', 1) = 'live'
            and split_part((select realtime.topic()), ':', 2) in (
              select w::text from private.my_workspace_ids() as w
            )
          )
          or ((select realtime.topic()) = 'live:admin:users' and (select private.is_platform_admin()))
          or ((select realtime.topic()) = 'live:global:workers' and (select private.is_approved()))
        )
      )
  $policy$;
end;
$$;

-- Grants the policy's helpers need (signed-in users only evaluate them).
grant execute on function private.my_workspace_ids() to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_approved() to authenticated;

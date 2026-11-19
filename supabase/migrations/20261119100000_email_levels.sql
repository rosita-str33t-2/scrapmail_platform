-- Email levels: how many times an email address was exported.
--   * email_levels: one row per address and workspace. Contacts of different agencies
--     with the same address share it, so one export raises it for all of them.
--     agency_contacts references it (workspace_id, email_normalized), so the
--     contact list can filter by level.
--   * Every export is a batch (contact_exports / contact_export_items) and raises the
--     level of its addresses by 1. "Undo last export" lowers them again; "reset"
--     sets every level back to 0. Batches that were undone or reset get cleared_at.

create table public.email_levels (
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  email_normalized  text not null,
  level             int not null default 0 check (level >= 0),
  updated_at        timestamptz not null default now(),
  primary key (workspace_id, email_normalized)
);

comment on table public.email_levels is
  'Export level per email address: 0 = never exported, +1 per export (shared by all contacts with the address).';

create index email_levels_level_idx on public.email_levels (workspace_id, level);

alter table public.email_levels enable row level security;
create policy "email_levels: workspace members" on public.email_levels
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));
grant select on public.email_levels to authenticated;

-- Every existing address starts at level 0.
insert into public.email_levels (workspace_id, email_normalized)
select distinct workspace_id, email_normalized
from public.agency_contacts
where email_normalized is not null
on conflict do nothing;

-- New addresses get a level row before the contact is written.
create function private.ensure_email_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(new.email));
begin
  if v_email is not null then
    insert into public.email_levels (workspace_id, email_normalized)
    values (new.workspace_id, v_email)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_email_level() from public;

create trigger agency_contacts_ensure_email_level
  before insert or update of email, workspace_id on public.agency_contacts
  for each row execute function private.ensure_email_level();

alter table public.agency_contacts
  add constraint agency_contacts_email_level_fkey
  foreign key (workspace_id, email_normalized)
  references public.email_levels (workspace_id, email_normalized);

-- Earlier exports did not raise levels: close them so "undo" never lowers a level
-- that was not raised by them (the history stays).
update public.contact_exports set cleared_at = now() where cleared_at is null;

-- Record an export and raise the levels -------------------------------------------
-- p_contact_ids: the contacts of the file, best first. Only contacts whose address is
-- still within the level range (when given) are taken, one per address. Returns the
-- batch id and the contact ids that were taken, in order. One export at a time per
-- workspace, so two exports can never take the same address at the same level.
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

-- Undo the most recent export that is still active: its addresses go down by 1.
create function public.undo_last_contact_export(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.contact_exports;
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('contact_export'), hashtext(p_workspace_id::text));

  select * into v_batch
  from public.contact_exports
  where workspace_id = p_workspace_id and cleared_at is null
  order by created_at desc
  limit 1;
  if v_batch.id is null then
    return null;
  end if;

  update public.email_levels l
     set level = greatest(l.level - 1, 0), updated_at = now()
   where l.workspace_id = p_workspace_id
     and l.email_normalized in (
       select c.email_normalized
       from public.contact_export_items i
       join public.agency_contacts c on c.id = i.contact_id
       where i.batch_id = v_batch.id
     );

  update public.contact_exports
     set cleared_at = now(), cleared_by = auth.uid()
   where id = v_batch.id;

  return jsonb_build_object(
    'batch_id', v_batch.id, 'exported', v_batch.exported, 'created_at', v_batch.created_at
  );
end;
$$;

-- Every address back to level 0; all exports count as undone (history is kept).
create function public.reset_email_levels(p_workspace_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('contact_export'), hashtext(p_workspace_id::text));

  update public.email_levels
     set level = 0, updated_at = now()
   where workspace_id = p_workspace_id and level > 0;
  get diagnostics v_count = row_count;

  update public.contact_exports
     set cleared_at = now(), cleared_by = auth.uid()
   where workspace_id = p_workspace_id and cleared_at is null;

  return v_count;
end;
$$;

revoke all on function public.record_contact_export(uuid, uuid[], int, int) from public, anon;
revoke all on function public.undo_last_contact_export(uuid) from public, anon;
revoke all on function public.reset_email_levels(uuid) from public, anon;
grant execute on function public.record_contact_export(uuid, uuid[], int, int) to authenticated;
grant execute on function public.undo_last_contact_export(uuid) to authenticated;
grant execute on function public.reset_email_levels(uuid) to authenticated;

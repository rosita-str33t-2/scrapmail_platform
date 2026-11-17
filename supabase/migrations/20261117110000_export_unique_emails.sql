-- Export by email address: the same address can belong to several agencies (e.g.
-- branches of one company). Each address is exported once, with its best-ranked
-- agency, and once exported it counts as used for every agency that has it.

create or replace function private.export_candidates(p_workspace_id uuid)
returns table (contact_id uuid, rank bigint)
language sql
stable
set search_path = ''
as $$
  with eligible as (
    select
      c.id,
      c.email_normalized,
      coalesce(a.priority, 5) as k_priority,
      case a.relevance when 'A' then 1 when 'B' then 2 when 'C' then 3
                       when 'D' then 4 when 'E' then 5 else 6 end as k_relevance,
      private.contact_role_rank(c.email, c.full_name, c.is_role_address) as k_role,
      case c.mailbox_check when 'confirmed' then 0 when 'catch_all' then 1 else 2 end as k_mailbox,
      -((a.website_url is not null)::int + (a.country_code is not null)::int
        + (a.city is not null)::int + (a.description is not null)::int
        + (c.full_name is not null)::int) as k_info,
      -coalesce(a.relevance_score, -1) as k_score,
      c.created_at
    from public.agency_contacts c
    join public.agencies a on a.id = c.agency_id
    where c.workspace_id = p_workspace_id
      and c.email is not null
      and (c.email_status is null or c.email_status = 'valid')
      and not exists (
        select 1
        from public.agency_contacts u
        join public.contact_export_items i on i.contact_id = u.id
        join public.contact_exports e on e.id = i.batch_id and e.cleared_at is null
        where u.workspace_id = c.workspace_id
          and u.email_normalized = c.email_normalized
      )
  ),
  best as (
    -- One row per address: the contact whose agency ranks best.
    select distinct on (email_normalized) *
    from eligible
    order by email_normalized, k_priority, k_relevance, k_role, k_mailbox, k_info, k_score, created_at, id
  )
  select id,
         row_number() over (
           order by k_priority, k_relevance, k_role, k_mailbox, k_info, k_score, created_at, id
         )
  from best;
$$;

revoke all on function private.export_candidates(uuid) from public;

-- Counts for the export dialog, by unique address.
create or replace function public.contact_export_summary(p_workspace_id uuid)
returns table (total bigint, unused bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return query
  with used as (
    select distinct u.email_normalized
    from public.contact_export_items i
    join public.contact_exports e on e.id = i.batch_id and e.cleared_at is null
    join public.agency_contacts u on u.id = i.contact_id
    where e.workspace_id = p_workspace_id
  ),
  addresses as (
    select distinct c.email_normalized
    from public.agency_contacts c
    where c.workspace_id = p_workspace_id
      and c.email is not null
      and (c.email_status is null or c.email_status = 'valid')
  )
  select count(*),
         count(*) filter (where not exists (
           select 1 from used where used.email_normalized = addresses.email_normalized
         ))
  from addresses;
end;
$$;

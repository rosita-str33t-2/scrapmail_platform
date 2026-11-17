-- Instantly CSV export.
--   * agencies: a short code (AgencyID "AGY-00001"), a type and a priority 1–4
--     (client's ranking: P1 luxury concierge / VIP travel / DMC … P4 unclear).
--   * agency_contacts.mailbox_check: result of asking the mail server whether the
--     mailbox exists (confirmed / catch_all / unknown).
--   * contact_exports + contact_export_items: every export is a batch of emails.
--     Emails in a batch that is not cleared are "used" and are skipped by the next
--     export; "reset" clears all batches (history is kept, contacts are not changed).

-- Agency code, type and priority ---------------------------------------------------
alter table public.agencies
  add column ref         bigint,
  add column agency_type text,
  add column priority    smallint check (priority between 1 and 4);

comment on column public.agencies.ref is 'Short agency number, exported as AgencyID AGY-00001.';
comment on column public.agencies.agency_type is 'Agency type from the website text (private.agency_type).';
comment on column public.agencies.priority is '1 (highest) to 4: export order (client ranking).';

-- Agency type from the name, website title, description and relevance keywords.
-- Strong types are taken from the name/title first, then from the whole text;
-- the general types only from the whole text. First matching rule wins.
create function private.agency_strong_type(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_text ~ '\m(concierge|concierges|conciergerie|lifestyle management|lifestyle manager|lifestyle concierge|members club|private client services)\M'
      then 'Luxury Concierge'
    when p_text ~ '\m(dmc|destination management(?! organi)|ground handler|ground handling|incoming agency|incoming tour operator|inbound tour operator|receptive (tour )?operator)\M'
      then 'DMC'
    when p_text ~ '\m(vip (travel|tours?|trips?|services?|experiences?|packages?|hospitality|tickets?|concierge|events?)|luxury travel|luxury trips?|luxury holidays?|luxury tours?|luxury vacations?|luxury experiences?|private jets?|jet charter|private air charter|yacht charter|bespoke travel|high[- ]end travel|exclusive travel|hospitality packages?|corporate hospitality|premium hospitality|vip hospitality)\M'
      then 'VIP Travel'
    when p_text ~ '\m(corporate travel|business travel|travel management|geschäftsreisen|geschaeftsreisen|firmenreisen|voyages d.affaires|viajes de negocios|viaggi d.affari|zakenreizen)\M'
      then 'Corporate Travel'
  end;
$$;

create function private.agency_type(
  p_name text,
  p_title text,
  p_description text,
  p_keywords text[],
  p_relevance public.agency_relevance
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  head text := lower(concat_ws(' ', p_name, p_title));
  t text := lower(concat_ws(' ', p_name, p_title, p_description, array_to_string(p_keywords, ' ')));
  strong text;
  travel constant text :=
    '\m(travel|travels|travel agency|travel agent|travel agents|reisen|reisebüro|reisebuero|reiseburo|'
    'reisbureau|reizen|voyages?|agence de voyages?|viajes|agencia de viajes|viaggi|agenzia (di )?viaggi|'
    'viagens|agência de viagens|agencia de viagens|resebyrå|resebyra|rejsebureau|reisebyrå|reisebyra|'
    'matkatoimisto|biuro podróży|biuro podrozy|cestovní kancelář|cestovni kancelar|utazási iroda|'
    'agenție de turism|agentie de turism|seyahat acentesi|турагентство|туристическое агентство|'
    'tourism agency|tourist agency|holidays?|vacations?)\M';
begin
  strong := private.agency_strong_type(head);
  if strong is not null then
    return strong;
  end if;
  if head ~ '\m(hotel|hotels|resort|resorts|palace)\M'
     and t ~ '\m(luxury|5[- ]star|five[- ]star|boutique hotel|grand hotel|palace)\M' then
    return 'Luxury Hotel';
  end if;
  if p_relevance = 'A'
     and head ~ '\m(tickets?|ticketing|ticket agency|hospitality|box office|billets?|billetterie|entradas|biglietti|eintrittskarten|karten|tickets kaufen)\M' then
    return 'Ticket & Hospitality';
  end if;
  strong := private.agency_strong_type(t);
  if strong is not null then
    return strong;
  end if;
  if t ~ travel
     and (p_relevance in ('A', 'B')
          or t ~ '\m(luxury|premium|exclusive|bespoke|tailor[- ]?made|sports travel|sport travel|event travel|sportreisen|eventreisen|sports tours)\M') then
    return 'Travel Agency';
  end if;
  if t ~ '\m(tour operator|tour operators|touroperator|reiseveranstalter|voyagiste|tour operador|operador turístico|operador turistico|туроператор)\M' then
    return 'Tour Operator';
  end if;
  if t ~ travel then
    return 'General Travel Agency';
  end if;
  if t ~ '\m(event agency|events agency|event management|event planner|event planners|event planning|eventagentur|agence événementielle|agence evenementielle|agencia de eventos|agenzia eventi|mice|incentives?|corporate events)\M' then
    return 'Event Agency';
  end if;
  if t ~ '\m(tours|excursions?|sightseeing|safaris?|expeditions?|trips?)\M' then
    return 'Tour Operator';
  end if;
  return 'Other';
end;
$$;

-- Priority by type; agencies whose website shows only weak signals (D/E) are 4.
create function private.agency_priority(p_type text, p_relevance public.agency_relevance)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case
    when p_relevance in ('D', 'E') then 4
    when p_type in ('Luxury Concierge', 'DMC', 'VIP Travel') then 1
    when p_type in ('Travel Agency', 'Luxury Hotel', 'Corporate Travel', 'Ticket & Hospitality') then 2
    when p_type in ('General Travel Agency', 'Tour Operator', 'Event Agency') then 3
    else 4
  end)::smallint;
$$;

create function private.set_agency_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.agency_type := private.agency_type(
    new.name, new.website_title, new.description, new.relevance_keywords, new.relevance
  );
  new.priority := private.agency_priority(new.agency_type, new.relevance);
  return new;
end;
$$;

-- Fill existing agencies without touching updated_at or writing 23k audit rows.
alter table public.agencies disable trigger user;
with numbered as (
  select id, row_number() over (order by created_at, id) as n from public.agencies
)
update public.agencies a
   set ref = numbered.n,
       agency_type = private.agency_type(
         a.name, a.website_title, a.description, a.relevance_keywords, a.relevance
       ),
       priority = private.agency_priority(
         private.agency_type(a.name, a.website_title, a.description, a.relevance_keywords, a.relevance),
         a.relevance
       )
  from numbered
 where numbered.id = a.id;
alter table public.agencies enable trigger user;

create sequence public.agencies_ref_seq owned by public.agencies.ref;
select setval('public.agencies_ref_seq', coalesce((select max(ref) from public.agencies), 0) + 1, false);
alter table public.agencies
  alter column ref set default nextval('public.agencies_ref_seq'),
  alter column ref set not null,
  add constraint agencies_ref_key unique (ref);

create trigger agencies_set_type
  before insert or update of name, website_title, description, relevance_keywords, relevance
  on public.agencies
  for each row execute function private.set_agency_type();

-- Mailbox check result --------------------------------------------------------------
alter table public.agency_contacts
  add column mailbox_check text check (mailbox_check in ('confirmed', 'catch_all', 'unknown'));

comment on column public.agency_contacts.mailbox_check is
  'Mail server answer: confirmed (mailbox exists), catch_all (server accepts any address), unknown (no clear answer). Null: not checked.';

-- Export batches -----------------------------------------------------------------------
create table public.contact_exports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  requested     int not null check (requested > 0),
  exported      int not null default 0,
  cleared_at    timestamptz,
  cleared_by    uuid references auth.users (id) on delete set null
);

create index contact_exports_workspace_idx on public.contact_exports (workspace_id, created_at desc);

create table public.contact_export_items (
  batch_id    uuid not null references public.contact_exports (id) on delete cascade,
  contact_id  uuid not null references public.agency_contacts (id) on delete cascade,
  position    int not null,
  primary key (batch_id, contact_id)
);

create index contact_export_items_contact_idx on public.contact_export_items (contact_id);

alter table public.contact_exports enable row level security;
alter table public.contact_export_items enable row level security;

create policy "contact_exports: workspace members" on public.contact_exports
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));
create policy "contact_export_items: workspace members" on public.contact_export_items
  for select to authenticated using (
    batch_id in (
      select e.id from public.contact_exports e
      where e.workspace_id in (select private.my_workspace_ids())
    )
  );

grant select on public.contact_exports, public.contact_export_items to authenticated;

create trigger contact_exports_audit
  after insert or update or delete on public.contact_exports
  for each row execute function private.audit_row_change();

-- Contact role, best first: 0 a person, 1 a business role (sales, partnerships …),
-- 2 a general inbox (info@ …), 3 an inbox nobody reads for sales (support, jobs …).
create function private.contact_role_rank(p_email text, p_full_name text, p_is_role boolean)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case
    when p_full_name is not null and btrim(p_full_name) <> '' then 0
    when not p_is_role then 0
    when split_part(lower(p_email), '@', 1) ~ '^(sales|vertrieb|ventas|vendite|ventes|partner|partners|partnership|partnerships|b2b|trade|agents?|groups?|gruppen|grupos|events?|eventi|eventos|corporate|vip|concierge|hospitality|tickets?|director|ceo|founder|owner|manager|gm|md|business|commercial|kommerz)([._+-].*)?$'
      then 1
    when split_part(lower(p_email), '@', 1) ~ '^(support|help|helpdesk|service|services|customerservice|customer\.service|kundenservice|care|billing|accounts?|accounting|buchhaltung|invoices?|rechnung|finance|careers?|jobs?|karriere|hr|recruiting|recruitment|press|presse|media|pr|webmaster|web|privacy|datenschutz|gdpr|dpo|legal|newsletter|news|feedback|complaints?|abuse|postmaster|hostmaster|admin|administrator|it|tech|marketing)([._+-].*)?$'
      then 3
    else 2
  end)::smallint;
$$;

-- Emails that may be exported: valid (or not checked yet) and not in an active batch.
create function private.export_candidates(p_workspace_id uuid)
returns table (contact_id uuid, rank bigint)
language sql
stable
set search_path = ''
as $$
  select c.id,
         row_number() over (
           order by
             a.priority nulls last,
             case a.relevance when 'A' then 1 when 'B' then 2 when 'C' then 3
                              when 'D' then 4 when 'E' then 5 else 6 end,
             private.contact_role_rank(c.email, c.full_name, c.is_role_address),
             case c.mailbox_check when 'confirmed' then 0 when 'catch_all' then 1 else 2 end,
             (a.website_url is not null)::int + (a.country_code is not null)::int
               + (a.city is not null)::int + (a.description is not null)::int
               + (c.full_name is not null)::int desc,
             a.relevance_score desc nulls last,
             c.created_at,
             c.id
         )
  from public.agency_contacts c
  join public.agencies a on a.id = c.agency_id
  where c.workspace_id = p_workspace_id
    and c.email is not null
    and (c.email_status is null or c.email_status = 'valid')
    and not exists (
      select 1
      from public.contact_export_items i
      join public.contact_exports e on e.id = i.batch_id
      where i.contact_id = c.id and e.cleared_at is null
    );
$$;

revoke all on function private.export_candidates(uuid) from public;

-- Export the next p_count best unused emails as a new batch; returns the batch id.
create function public.export_contacts(p_workspace_id uuid, p_count int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
  v_count int;
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'number of emails must be between 1 and 100000' using errcode = '22023';
  end if;
  -- One export at a time per workspace, so two clicks never hand out the same email.
  perform pg_advisory_xact_lock(hashtext('contact_export'), hashtext(p_workspace_id::text));

  insert into public.contact_exports (workspace_id, created_by, requested)
  values (p_workspace_id, auth.uid(), p_count)
  returning id into v_batch;

  insert into public.contact_export_items (batch_id, contact_id, position)
  select v_batch, x.contact_id, x.rank
  from private.export_candidates(p_workspace_id) x
  where x.rank <= p_count;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'no unused emails left: reset the exports to start again' using errcode = 'P0002';
  end if;

  update public.contact_exports set exported = v_count where id = v_batch;
  return v_batch;
end;
$$;

-- Rows of a batch for the CSV (one JSON array: not cut off by the API row limit).
create function public.contact_export_rows(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_rows jsonb;
begin
  select workspace_id into v_workspace from public.contact_exports where id = p_batch_id;
  if v_workspace is null or not private.is_workspace_member(v_workspace) then
    raise exception 'export not found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', btrim(c.email),
           'full_name', c.full_name,
           'company', a.name,
           'website', a.website_url,
           'country_code', a.country_code,
           'country_name', a.country_name,
           'city', a.city,
           'agency_type', a.agency_type,
           'agency_ref', a.ref
         ) order by i.position), '[]'::jsonb)
    into v_rows
  from public.contact_export_items i
  join public.agency_contacts c on c.id = i.contact_id
  join public.agencies a on a.id = c.agency_id
  where i.batch_id = p_batch_id;
  return v_rows;
end;
$$;

-- Counts for the export dialog.
create function public.contact_export_summary(p_workspace_id uuid)
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
  select count(*),
         count(*) filter (where not exists (
           select 1
           from public.contact_export_items i
           join public.contact_exports e on e.id = i.batch_id
           where i.contact_id = c.id and e.cleared_at is null
         ))
  from public.agency_contacts c
  where c.workspace_id = p_workspace_id
    and c.email is not null
    and (c.email_status is null or c.email_status = 'valid');
end;
$$;

-- Make every email unused again (the export history is kept).
create function public.reset_contact_exports(p_workspace_id uuid)
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
  update public.contact_exports
     set cleared_at = now(), cleared_by = auth.uid()
   where workspace_id = p_workspace_id and cleared_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.export_contacts(uuid, int) from public, anon;
revoke all on function public.contact_export_rows(uuid) from public, anon;
revoke all on function public.contact_export_summary(uuid) from public, anon;
revoke all on function public.reset_contact_exports(uuid) from public, anon;
grant execute on function public.export_contacts(uuid, int) to authenticated;
grant execute on function public.contact_export_rows(uuid) to authenticated;
grant execute on function public.contact_export_summary(uuid) to authenticated;
grant execute on function public.reset_contact_exports(uuid) to authenticated;

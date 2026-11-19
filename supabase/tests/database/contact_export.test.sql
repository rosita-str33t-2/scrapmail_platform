-- Instantly export: agency type/priority, export order, no email exported twice,
-- reset, and workspace isolation (pgTAP). Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'export-a@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'export-b@test.local');
-- Exporting is for administrators only (see inbox_and_export_access.test.sql).
update public.profiles set status = 'approved', platform_role = 'admin'
 where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
insert into public.workspaces (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000f1', 'Export A', 'export-a'),
  ('00000000-0000-0000-0000-0000000000f2', 'Export B', 'export-b');
insert into public.workspace_members (workspace_id, user_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2');

insert into public.agencies (id, workspace_id, name, normalized_name, identity_key, relevance, description, website_url, country_code, city) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000f1',
   'Elite Concierge London', 'elite concierge london', 'elite-test.com', 'C', 'Lifestyle and travel', 'https://elite-test.com', 'GB', 'London'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000f1',
   'Sunny Travel', 'sunny travel', 'sunny-test.com', 'C', 'Family holidays', 'https://sunny-test.com', 'ES', null),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-0000000000f1',
   'Box Shop', 'box shop', 'box-test.com', 'D', null, null, null, null);

insert into public.agency_contacts (workspace_id, agency_id, email, full_name, is_role_address, source, email_status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a001', 'info@elite-test.com', null, true, 'website', 'valid'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a001', 'john@elite-test.com', 'John Smith', false, 'website', 'valid'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a001', 'support@elite-test.com', null, true, 'website', 'valid'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a002', 'sales@sunny-test.com', null, true, 'website', null),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a002', 'bad@sunny-test.com', null, true, 'website', 'invalid'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a003', 'hello@box-test.com', null, true, 'website', 'valid'),
  -- Same address under a second agency: exported once, with the better agency.
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a003', 'Info@elite-test.com', null, true, 'website', 'valid');

create temp table batch (id uuid);
grant all on batch to authenticated;

select results_eq(
  $$ select agency_type, priority from public.agencies
      where id in ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002',
                   '00000000-0000-0000-0000-00000000a003') order by name $$,
  $$ values ('Other'::text, 4::smallint), ('Luxury Concierge', 1::smallint), ('General Travel Agency', 3::smallint) $$,
  'new agencies get a type and a priority'
);
select isnt(
  (select ref from public.agencies where id = '00000000-0000-0000-0000-00000000a001'), null,
  'new agencies get an AgencyID number'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select results_eq(
  $$ select total, unused from public.contact_export_summary('00000000-0000-0000-0000-0000000000f1') $$,
  $$ values (5::bigint, 5::bigint) $$,
  'summary counts each valid address once'
);

insert into batch select public.export_contacts('00000000-0000-0000-0000-0000000000f1', 2);
select results_eq(
  $$ select x.e->>'email' from batch b,
       jsonb_array_elements(public.contact_export_rows(b.id)) with ordinality x(e, n) order by x.n $$,
  $$ values ('john@elite-test.com'), ('info@elite-test.com') $$,
  'first export: highest priority, a person before a general inbox'
);
select results_eq(
  $$ select x.e->>'company', x.e->>'agency_type', x.e->>'full_name' from batch b,
       jsonb_array_elements(public.contact_export_rows(b.id)) with ordinality x(e, n) where x.n = 1 $$,
  $$ values ('Elite Concierge London', 'Luxury Concierge', 'John Smith') $$,
  'rows carry the agency details'
);
select results_eq(
  $$ select unused from public.contact_export_summary('00000000-0000-0000-0000-0000000000f1') $$,
  $$ values (3::bigint) $$,
  'exported emails are no longer unused'
);

delete from batch;
insert into batch select public.export_contacts('00000000-0000-0000-0000-0000000000f1', 10);
select results_eq(
  $$ select x.e->>'email' from batch b,
       jsonb_array_elements(public.contact_export_rows(b.id)) with ordinality x(e, n) order by x.n $$,
  $$ values ('support@elite-test.com'), ('sales@sunny-test.com'), ('hello@box-test.com') $$,
  'next export: only the remaining emails, in order (invalid ones never)'
);
select results_eq(
  $$ select requested, exported from public.contact_exports c join batch b on b.id = c.id $$,
  $$ values (10, 3) $$,
  'a batch records how many were asked for and exported'
);
select throws_ok(
  $$ select public.export_contacts('00000000-0000-0000-0000-0000000000f1', 5) $$,
  'P0002', null,
  'nothing left to export'
);

select is(
  public.reset_contact_exports('00000000-0000-0000-0000-0000000000f1'), 2,
  'reset clears both batches'
);
select results_eq(
  $$ select unused from public.contact_export_summary('00000000-0000-0000-0000-0000000000f1') $$,
  $$ values (5::bigint) $$,
  'after a reset every email is unused again'
);

-- Another workspace's member.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select throws_ok(
  $$ select public.export_contacts('00000000-0000-0000-0000-0000000000f1', 1) $$,
  '42501', null,
  'other workspaces cannot export'
);
select throws_ok(
  $$ select public.contact_export_rows(id) from batch $$,
  'P0002', null,
  'other workspaces cannot download a batch'
);

select * from finish();
rollback;

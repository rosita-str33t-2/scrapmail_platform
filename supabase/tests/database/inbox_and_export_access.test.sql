-- Administrator-only export, conversation messages, reply templates and reply
-- actions: who may do what (pgTAP). Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- c1: administrator of workspace w1, c2: member of w1, c3: member of w2.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'inbox-admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'inbox-member@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'inbox-other@test.local');
update public.profiles set status = 'approved'
 where user_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2',
                   '00000000-0000-0000-0000-0000000000c3');
update public.profiles set platform_role = 'admin'
 where user_id = '00000000-0000-0000-0000-0000000000c1';
insert into public.workspaces (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000d1', 'Inbox A', 'inbox-a'),
  ('00000000-0000-0000-0000-0000000000d2', 'Inbox B', 'inbox-b');
insert into public.workspace_members (workspace_id, user_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c3');

insert into public.agencies (id, workspace_id, name, normalized_name, identity_key) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000d1',
   'Inbox Travel', 'inbox travel', 'inbox-travel-test.com');
insert into public.agency_contacts (id, workspace_id, agency_id, email, source, email_status) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000b001', 'anna@inbox-travel-test.com', 'website', 'valid');

insert into public.campaign_replies (id, workspace_id, lead_email, eaccount, received_at, thread_id) values
  ('reply-1', '00000000-0000-0000-0000-0000000000d1', 'Anna@Inbox-Travel-Test.com', 'me@sender.test', now(), 'thread-1');
insert into public.campaign_messages (id, workspace_id, thread_id, lead_email, direction, sent_at, body_text) values
  ('msg-1', '00000000-0000-0000-0000-0000000000d1', 'thread-1', 'anna@inbox-travel-test.com', 'received', now(), 'Hello');

-- A member (not an administrator) ----------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

select throws_ok(
  $$ select public.record_contact_export('00000000-0000-0000-0000-0000000000d1',
       array['00000000-0000-0000-0000-00000000c001']::uuid[]) $$,
  '42501', 'only administrators can export emails',
  'members cannot export'
);
select throws_ok(
  $$ select public.undo_last_contact_export('00000000-0000-0000-0000-0000000000d1') $$,
  '42501', 'only administrators can export emails',
  'members cannot undo an export'
);
select throws_ok(
  $$ select public.reset_email_levels('00000000-0000-0000-0000-0000000000d1') $$,
  '42501', 'only administrators can export emails',
  'members cannot reset levels'
);
select throws_ok(
  $$ select public.export_contacts('00000000-0000-0000-0000-0000000000d1', 1) $$,
  '42501', 'only administrators can export emails',
  'members cannot use the older export either'
);
select throws_ok(
  $$ select private.record_contact_export('00000000-0000-0000-0000-0000000000d1',
       array['00000000-0000-0000-0000-00000000c001']::uuid[]) $$,
  '42501', null,
  'the unchecked export function cannot be called directly'
);

select is(
  (select count(*) from public.campaign_messages), 1::bigint,
  'members read their workspace''s conversation messages'
);
select throws_ok(
  $$ insert into public.campaign_messages (id, workspace_id, direction, sent_at)
     values ('fake', '00000000-0000-0000-0000-0000000000d1', 'sent', now()) $$,
  '42501', null,
  'members cannot write conversation messages (server only)'
);

insert into public.reply_templates (workspace_id, name, body_html)
values ('00000000-0000-0000-0000-0000000000d1', 'Thanks', '<p>Thank you!</p>');
select is(
  (select count(*) from public.reply_templates), 1::bigint,
  'members save and read reply templates'
);
select throws_ok(
  $$ insert into public.reply_templates (workspace_id, name, body_html)
     values ('00000000-0000-0000-0000-0000000000d2', 'Sneaky', 'x') $$,
  '42501', null,
  'templates cannot be added to another workspace'
);

select lives_ok(
  $$ select public.mark_reply_sent('reply-1') $$,
  'members mark a reply as answered'
);
select lives_ok(
  $$ select public.set_lead_interest('00000000-0000-0000-0000-0000000000d1', 'anna@inbox-travel-test.com', 1) $$,
  'members set a lead''s interest status'
);
select throws_ok(
  $$ select public.set_lead_interest('00000000-0000-0000-0000-0000000000d1', 'anna@inbox-travel-test.com', 9) $$,
  '22023', null,
  'unknown interest statuses are refused'
);

-- Another workspace's member -----------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select is(
  (select count(*) from public.campaign_messages), 0::bigint,
  'other workspaces see no conversation messages'
);
select is(
  (select count(*) from public.reply_templates), 0::bigint,
  'other workspaces see no templates'
);
select throws_ok(
  $$ select public.mark_reply_sent('reply-1') $$,
  'P0002', null,
  'other workspaces cannot touch the reply'
);
select throws_ok(
  $$ select public.set_lead_interest('00000000-0000-0000-0000-0000000000d1', 'anna@inbox-travel-test.com', 1) $$,
  '42501', null,
  'other workspaces cannot set interest'
);

-- The administrator -----------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select is(
  jsonb_array_length(public.record_contact_export('00000000-0000-0000-0000-0000000000d1',
    array['00000000-0000-0000-0000-00000000c001']::uuid[]) -> 'contact_ids'),
  1,
  'administrators export'
);

reset role;
select results_eq(
  $$ select replied_by, handled_by, interest_status from public.campaign_replies where id = 'reply-1' $$,
  $$ values ('00000000-0000-0000-0000-0000000000c2'::uuid, '00000000-0000-0000-0000-0000000000c2'::uuid, 1) $$,
  'the reply records who answered it, and the interest status'
);
select is(
  (select level from public.email_levels
    where workspace_id = '00000000-0000-0000-0000-0000000000d1'
      and email_normalized = 'anna@inbox-travel-test.com'),
  1,
  'the administrator''s export raised the level'
);

select * from finish();
rollback;

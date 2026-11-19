-- Contacts with their export level as a plain column, for the contact list and the
-- export. Filtering through the embedded email_levels row made PostgREST check the
-- level row by row; in a view the planner joins both tables at once.
-- security_invoker: the caller's row level security applies, as on the tables.

create view public.contact_list
with (security_invoker = true)
as
select c.*, coalesce(l.level, 0) as export_level
from public.agency_contacts c
left join public.email_levels l
  on l.workspace_id = c.workspace_id and l.email_normalized = c.email_normalized;

comment on view public.contact_list is
  'agency_contacts plus export_level (times the address was exported; 0 = never).';

grant select on public.contact_list to authenticated;

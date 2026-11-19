-- Faster contact list.
--   * email_levels got new columns (blocked, ...) after its statistics were last
--     gathered, so the planner guessed "blocked is null" matches 0.5% of rows and
--     sorted all 34k contacts for every page. Fresh statistics let it read the 50 rows
--     of a page in email order from the existing index (100 ms -> 15 ms).
--   * The number of matching contacts is counted from a small index instead of the
--     whole table (about 4x less to read when the data is not in memory). It replaces
--     the index on the same columns.

create index agency_contacts_email_count_idx
  on public.agency_contacts (workspace_id, email_normalized)
  include (email_status, source, is_role_address);

drop index public.agency_contacts_email_idx;

analyze public.email_levels;
analyze public.agency_contacts;
analyze public.agencies;

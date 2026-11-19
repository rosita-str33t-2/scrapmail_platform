-- Every table has row level security (security baseline). private.live_signals is only
-- used by the live update functions, which run as the table owner; no policies, so no
-- signed-in user can read or change it.
alter table private.live_signals enable row level security;

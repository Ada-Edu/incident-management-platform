-- API role privileges
-- Created: 2026-07-07
-- Purpose: grant the Supabase API roles access to public objects. RLS still
--          governs WHICH ROWS each role can see (policies in the previous
--          migration); these GRANTs let PostgREST reach the tables at all —
--          without them every request is rejected with "permission denied"
--          before RLS is ever evaluated.
--
--   anon           -> schema usage only (login required before any data access)
--   authenticated  -> DML on all tables; RLS scopes the rows
--   service_role    -> full access (bypasses RLS; used by edge functions)

grant usage on schema public to anon, authenticated, service_role;

-- Logged-in users: reads + writes on every table/view. RLS decides the rows.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Sequences (e.g. incident_number_seq) are advanced by triggers running as the
-- calling (authenticated) role, so they need usage.
grant usage, select on all sequences in schema public to authenticated;

-- RPCs + helper functions (match_knowledge, etc.) callable by logged-in users.
grant execute on all routines in schema public to authenticated;

-- Edge functions use the service role (also bypasses RLS).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all routines in schema public to service_role;

-- Ensure objects created in future migrations inherit the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on routines to authenticated;

-- Row Level Security policies
-- Created: 2026-07-07
-- Purpose: enforce role-based authorization at the database layer. Never rely on
--          client-side filtering alone (template guidance §10.4).
--
-- Role model:
--   client        -> only their own incidents / reporter-scoped data
--   developer      -> incidents assigned to them or their team, all reference data
--   manager        -> everything (read/write across the org)
--   administrator  -> everything + configuration + user management
--
-- Reference/lookup tables are readable by all authenticated users; writable only
-- by administrators.

-- Enable RLS everywhere.
alter table public.profiles                enable row level security;
alter table public.teams                   enable row level security;
alter table public.categories              enable row level security;
alter table public.priorities              enable row level security;
alter table public.severities              enable row level security;
alter table public.environments            enable row level security;
alter table public.statuses                enable row level security;
alter table public.customers               enable row level security;
alter table public.sla_policies            enable row level security;
alter table public.incidents               enable row level security;
alter table public.incident_status_history enable row level security;
alter table public.incident_comments       enable row level security;
alter table public.incident_attachments    enable row level security;
alter table public.incident_assignments    enable row level security;
alter table public.kb_articles             enable row level security;
alter table public.knowledge_embeddings    enable row level security;
alter table public.ai_interactions         enable row level security;
alter table public.audit_log               enable row level security;
alter table public.notifications           enable row level security;
alter table public.zendesk_sync_log        enable row level security;
alter table public.system_settings         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_self_or_staff on public.profiles
  for select using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Reference tables: read for all authenticated, write for admins.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'teams','categories','priorities','severities','environments',
    'statuses','customers','sla_policies'
  ]
  loop
    execute format('create policy %I_read on public.%I for select to authenticated using (true);', t, t);
    execute format('create policy %I_admin_write on public.%I for all using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- incidents
--   client     : rows they reported
--   developer   : rows assigned to them or their team
--   staff       : all rows
-- ---------------------------------------------------------------------------
create policy incidents_select on public.incidents
  for select using (
    public.is_staff()
    or reporter_id = auth.uid()
    or assigned_to = auth.uid()
    or assigned_team_id = (select team_id from public.profiles where id = auth.uid())
  );

-- Clients may create incidents (they become the reporter).
create policy incidents_insert on public.incidents
  for insert with check (
    reporter_id = auth.uid() or public.is_staff()
  );

-- Developers may update incidents assigned to them; staff may update anything.
create policy incidents_update on public.incidents
  for update using (
    public.is_staff()
    or assigned_to = auth.uid()
    or assigned_team_id = (select team_id from public.profiles where id = auth.uid())
  );

-- Only managers/admins may delete.
create policy incidents_delete on public.incidents
  for delete using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Incident child tables: visibility follows the parent incident.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_incident(iid uuid)
returns boolean as $$
  select exists (
    select 1 from public.incidents i
    where i.id = iid and (
      public.is_staff()
      or i.reporter_id = auth.uid()
      or i.assigned_to = auth.uid()
      or i.assigned_team_id = (select team_id from public.profiles where id = auth.uid())
    )
  );
$$ language sql stable security definer set search_path = public;

-- status history (read-only to users; written by triggers)
create policy status_history_select on public.incident_status_history
  for select using (public.can_see_incident(incident_id));

-- comments: visible if you can see the incident; internal comments hidden from clients.
create policy comments_select on public.incident_comments
  for select using (
    public.can_see_incident(incident_id)
    and (not is_internal or public.current_app_role() <> 'client')
  );
create policy comments_insert on public.incident_comments
  for insert with check (public.can_see_incident(incident_id) and author_id = auth.uid());
create policy comments_update_own on public.incident_comments
  for update using (author_id = auth.uid() or public.is_staff());

-- attachments
create policy attachments_select on public.incident_attachments
  for select using (public.can_see_incident(incident_id));
create policy attachments_insert on public.incident_attachments
  for insert with check (public.can_see_incident(incident_id) and uploaded_by = auth.uid());

-- assignments (read-only to users; managed by staff/triggers)
create policy assignments_select on public.incident_assignments
  for select using (public.can_see_incident(incident_id));
create policy assignments_write on public.incident_assignments
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Knowledge base + AI
-- ---------------------------------------------------------------------------
create policy kb_read on public.kb_articles
  for select to authenticated using (is_published or public.is_staff());
create policy kb_write on public.kb_articles
  for all using (public.is_staff()) with check (public.is_staff());

-- Embeddings: readable by staff; written by the service role (edge functions
-- bypass RLS). Clients never read raw embeddings.
create policy embeddings_staff_read on public.knowledge_embeddings
  for select using (public.is_staff());

-- AI interactions: users see their own; staff see all.
create policy ai_interactions_select on public.ai_interactions
  for select using (user_id = auth.uid() or public.is_staff());
create policy ai_interactions_insert on public.ai_interactions
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit / notifications / sync / settings
-- ---------------------------------------------------------------------------
create policy audit_staff_read on public.audit_log
  for select using (public.is_staff());

create policy notifications_own on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid());

create policy sync_staff_read on public.zendesk_sync_log
  for select using (public.is_staff());

create policy settings_admin on public.system_settings
  for all using (public.is_admin()) with check (public.is_admin());
-- Non-secret settings are readable by staff (e.g. to show integration status).
create policy settings_staff_read on public.system_settings
  for select using (public.is_staff() and not is_secret);

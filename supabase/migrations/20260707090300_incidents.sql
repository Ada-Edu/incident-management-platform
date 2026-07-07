-- Core incident domain
-- Created: 2026-07-07
-- Purpose: the incidents table and its satellite tables (status history,
--          comments, attachments, assignments). Dedicated relational model
--          for query performance and clear SLA logic.

-- Monotonic incident number sequence -> rendered as INC-000001.
create sequence if not exists public.incident_number_seq start 1000;

create table if not exists public.incidents (
  id                 uuid primary key default gen_random_uuid(),
  incident_number    text unique,                              -- INC-001042 (trigger-assigned)
  zendesk_ticket_id  text unique,                              -- external Zendesk id
  title              text not null,
  description        text,

  -- Classification (all soft references to admin-managed lookups)
  category_id        uuid references public.categories(id) on delete set null,
  subcategory_id     uuid references public.categories(id) on delete set null,
  priority_id        uuid references public.priorities(id) on delete set null,
  severity_id        uuid references public.severities(id) on delete set null,
  environment_id     uuid references public.environments(id) on delete set null,
  status_id          uuid not null references public.statuses(id),

  -- Parties
  customer_id        uuid references public.customers(id) on delete set null,
  reporter_id        uuid references public.profiles(id) on delete set null,   -- who logged it
  assigned_to        uuid references public.profiles(id) on delete set null,   -- developer
  assigned_team_id   uuid references public.teams(id) on delete set null,

  -- SLA (derived from matching sla_policy on assignment)
  sla_policy_id      uuid references public.sla_policies(id) on delete set null,
  sla_response_due   timestamptz,
  sla_resolve_due    timestamptz,
  first_responded_at timestamptz,
  resolved_at        timestamptz,
  closed_at          timestamptz,
  response_breached  boolean not null default false,
  resolve_breached   boolean not null default false,

  -- Resolution knowledge
  root_cause         text,
  resolution_notes   text,
  workaround         text,

  -- AI linkage: confidence + suggested article at intake
  ai_confidence      numeric,                                   -- 0..1
  ai_self_resolved   boolean not null default false,

  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_incidents_updated_at
  before update on public.incidents
  for each row execute function public.update_updated_at();

create index if not exists idx_incidents_status      on public.incidents(status_id);
create index if not exists idx_incidents_priority    on public.incidents(priority_id);
create index if not exists idx_incidents_assigned_to on public.incidents(assigned_to);
create index if not exists idx_incidents_team        on public.incidents(assigned_team_id);
create index if not exists idx_incidents_customer    on public.incidents(customer_id);
create index if not exists idx_incidents_reporter    on public.incidents(reporter_id);
create index if not exists idx_incidents_created_at  on public.incidents(created_at desc);
create index if not exists idx_incidents_sla_resolve on public.incidents(sla_resolve_due);
create index if not exists idx_incidents_zendesk     on public.incidents(zendesk_ticket_id);
-- Fuzzy global search across title + number.
create index if not exists idx_incidents_title_trgm  on public.incidents using gin (title gin_trgm_ops);
create index if not exists idx_incidents_number_trgm on public.incidents using gin (incident_number gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Status history: one row per transition. Powers the workflow timeline and
-- "time spent in each stage" analytics.
-- ---------------------------------------------------------------------------
create table if not exists public.incident_status_history (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references public.incidents(id) on delete cascade,
  from_status_id uuid references public.statuses(id),
  to_status_id   uuid not null references public.statuses(id),
  changed_by     uuid references public.profiles(id) on delete set null,
  note           text,
  entered_at     timestamptz not null default now(),
  exited_at      timestamptz,                                  -- set when superseded
  created_at     timestamptz not null default now()
);
create index if not exists idx_status_history_incident on public.incident_status_history(incident_id, entered_at);

-- ---------------------------------------------------------------------------
-- Comments / technical notes. is_internal hides notes from client-role users.
-- ---------------------------------------------------------------------------
create table if not exists public.incident_comments (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references public.incidents(id) on delete cascade,
  author_id      uuid references public.profiles(id) on delete set null,
  body           text not null,
  is_internal    boolean not null default false,
  zendesk_comment_id text,
  source         text not null default 'app',                  -- app | zendesk | ai
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_incident_comments_updated_at
  before update on public.incident_comments
  for each row execute function public.update_updated_at();
create index if not exists idx_comments_incident on public.incident_comments(incident_id, created_at);

-- ---------------------------------------------------------------------------
-- Attachments. Files live in Supabase Storage; this table holds metadata.
-- ---------------------------------------------------------------------------
create table if not exists public.incident_attachments (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references public.incidents(id) on delete cascade,
  uploaded_by    uuid references public.profiles(id) on delete set null,
  file_name      text not null,
  storage_path   text not null,
  content_type   text,
  size_bytes     bigint,
  zendesk_attachment_id text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_attachments_incident on public.incident_attachments(incident_id);

-- ---------------------------------------------------------------------------
-- Assignment history (who owned the incident, when). Complements incidents.assigned_to.
-- ---------------------------------------------------------------------------
create table if not exists public.incident_assignments (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references public.incidents(id) on delete cascade,
  assigned_to   uuid references public.profiles(id) on delete set null,
  assigned_team_id uuid references public.teams(id) on delete set null,
  assigned_by   uuid references public.profiles(id) on delete set null,
  is_current    boolean not null default true,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz
);
create index if not exists idx_assignments_incident on public.incident_assignments(incident_id) where is_current;
create index if not exists idx_assignments_assignee on public.incident_assignments(assigned_to) where is_current;

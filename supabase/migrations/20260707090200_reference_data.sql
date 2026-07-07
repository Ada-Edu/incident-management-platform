-- Reference / configuration tables (admin-managed lookups)
-- Created: 2026-07-07
-- Purpose: categories, priorities, severities, environments, workflow statuses,
--          teams, customers and SLA policies. These drive the incident domain
--          and are all editable by administrators.

-- Teams (support / development squads)
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_teams_updated_at
  before update on public.teams
  for each row execute function public.update_updated_at();

-- Now that teams exist, wire the profiles.team_id FK.
alter table public.profiles
  drop constraint if exists fk_profiles_team;
alter table public.profiles
  add constraint fk_profiles_team
  foreign key (team_id) references public.teams(id) on delete set null;

-- Categories (top-level) + subcategories (self-referencing parent).
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete cascade,
  key         text not null unique,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.update_updated_at();
create index if not exists idx_categories_parent on public.categories(parent_id);

-- Priorities (e.g. Low..Critical). Lower rank = more urgent.
create table if not exists public.priorities (
  id                     uuid primary key default gen_random_uuid(),
  key                    text not null unique,
  name                   text not null,
  rank                   int not null,               -- 1 = highest urgency
  color                  text,                        -- hex for UI badges
  default_response_mins  int,                         -- SLA first-response target
  default_resolve_mins   int,                         -- SLA resolution target
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger trg_priorities_updated_at
  before update on public.priorities
  for each row execute function public.update_updated_at();

-- Severities (business impact scale).
create table if not exists public.severities (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  rank       int not null,                            -- 1 = most severe
  color      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_severities_updated_at
  before update on public.severities
  for each row execute function public.update_updated_at();

-- Environments (Production, Staging, ...).
create table if not exists public.environments (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_environments_updated_at
  before update on public.environments
  for each row execute function public.update_updated_at();

-- Workflow statuses. Ordered pipeline; is_open / is_terminal drive analytics.
create table if not exists public.statuses (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  sort_order  int not null,
  is_open     boolean not null default true,          -- counts toward "open" KPIs
  is_terminal boolean not null default false,         -- resolved / closed
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_statuses_updated_at
  before update on public.statuses
  for each row execute function public.update_updated_at();

-- Customers (the organisation / account raising incidents).
create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  domain         text,
  contact_email  text,
  zendesk_org_id text,
  metadata       jsonb not null default '{}'::jsonb,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.update_updated_at();
create index if not exists idx_customers_name_trgm on public.customers using gin (name gin_trgm_ops);

-- SLA policies. A policy maps a priority (and optionally severity) to response
-- and resolution targets, in minutes. Incident SLA targets are derived from the
-- matching policy at assignment time.
create table if not exists public.sla_policies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  priority_id       uuid references public.priorities(id) on delete cascade,
  severity_id       uuid references public.severities(id) on delete cascade,
  response_mins     int not null,
  resolve_mins      int not null,
  business_hours_only boolean not null default false,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_sla_policies_updated_at
  before update on public.sla_policies
  for each row execute function public.update_updated_at();
create index if not exists idx_sla_policies_priority on public.sla_policies(priority_id);

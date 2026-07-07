-- Audit trail, notifications, Zendesk sync log, system settings
-- Created: 2026-07-07

-- Append-only audit log. Written by triggers and by the application/edge layer.
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,                       -- e.g. incident.status_changed
  entity_type text not null,                       -- incident | profile | setting | sync ...
  entity_id   uuid,
  summary     text,
  changes     jsonb not null default '{}'::jsonb,  -- { before: {...}, after: {...} }
  ip_address  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_entity on public.audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_actor  on public.audit_log(actor_id, created_at desc);

-- In-app notifications. Email delivery is fanned out by an edge function that
-- watches this table (or via a DB webhook).
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,                       -- assignment | status_change | sla_warning | sla_breach | comment | customer_update
  title       text not null,
  body        text,
  incident_id uuid references public.incidents(id) on delete cascade,
  is_read     boolean not null default false,
  email_sent  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, is_read, created_at desc);

-- Zendesk synchronisation audit. One row per sync run (manual or scheduled).
create table if not exists public.zendesk_sync_log (
  id            uuid primary key default gen_random_uuid(),
  direction     text not null default 'inbound',   -- inbound | outbound
  trigger_type  text not null default 'manual',    -- manual | scheduled | webhook
  status        text not null default 'running',   -- running | success | partial | failed
  tickets_seen  int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  error_count   int not null default 0,
  details       jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists idx_sync_log_started on public.zendesk_sync_log(started_at desc);

-- Key/value system settings (Zendesk config, AI config, feature flags).
-- Secrets should live in Supabase Vault / function env, NOT here; store only
-- non-secret config and references.
create table if not exists public.system_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text,
  is_secret   boolean not null default false,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create trigger trg_system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.update_updated_at();

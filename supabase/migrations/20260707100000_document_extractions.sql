-- Document Field Extraction — persistence
-- Created: 2026-07-07
-- Feature spec: docs/specs/document-field-extraction.md
-- ADRs: 0001-orchestrate-extraction-with-temporal, 0002-host-model-on-bedrock
--
-- One row per extraction run for a document attached to an incident. The
-- Temporal worker writes status + result via the service role (bypasses RLS);
-- app users read/create following the parent incident's visibility.

create table if not exists public.document_extractions (
  id             uuid primary key default gen_random_uuid(),
  incident_id    uuid not null references public.incidents(id) on delete cascade,
  attachment_id  uuid references public.incident_attachments(id) on delete set null,
  storage_path   text not null,                       -- object path in the incident-docs bucket
  file_name      text,
  status         text not null default 'pending'
                   check (status in ('pending', 'running', 'succeeded', 'failed')),
  -- Typed failure reason; maps 1:1 to the spec's edge cases.
  failure_reason text
                   check (failure_reason is null or failure_reason in
                     ('unsupported_type','too_large','password_protected','corrupt','no_text','model_error','internal')),
  page_count     int,
  model_id       text,
  -- { "parties":[{"name","role"}], "key_dates":[{"label","date"}], "key_terms":[{"label","value"}] }
  result         jsonb not null default '{"parties":[],"key_dates":[],"key_terms":[]}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_document_extractions_updated_at
  before update on public.document_extractions
  for each row execute function public.update_updated_at();

create index if not exists idx_doc_extractions_incident on public.document_extractions(incident_id, created_at desc);
create index if not exists idx_doc_extractions_status   on public.document_extractions(status);

-- RLS: visibility follows the parent incident (reuses the helper from the
-- incident RLS migration). The worker uses the service role and bypasses this.
alter table public.document_extractions enable row level security;

create policy doc_extractions_select on public.document_extractions
  for select using (public.can_see_incident(incident_id));
create policy doc_extractions_insert on public.document_extractions
  for insert with check (public.can_see_incident(incident_id));
create policy doc_extractions_update on public.document_extractions
  for update using (public.is_staff() or public.can_see_incident(incident_id));

-- Grants (RLS still governs rows; PostgREST needs table privileges first).
grant select, insert, update on public.document_extractions to authenticated;
grant all on public.document_extractions to service_role;

-- Storage bucket for uploaded documents (private; RLS on storage.objects).
insert into storage.buckets (id, name, public)
values ('incident-docs', 'incident-docs', false)
on conflict (id) do nothing;

-- Storage RLS: an authenticated user may read/write objects in incident-docs.
-- (Path-level scoping to a specific incident can be tightened later; for the
-- first slice, authenticated access + table-level RLS on extractions is the gate.)
create policy incident_docs_read on storage.objects
  for select to authenticated using (bucket_id = 'incident-docs');
create policy incident_docs_write on storage.objects
  for insert to authenticated with check (bucket_id = 'incident-docs');

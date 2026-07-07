-- Extensions + shared utility functions
-- Created: 2026-07-07
-- Purpose: foundational extensions and reusable trigger helpers for the
--          AI-Powered Incident Management Platform.
--
-- Conventions (inherited from the project template):
--   * UUID primary keys via gen_random_uuid()
--   * created_at / updated_at timestamptz columns on every table
--   * updated_at maintained by the shared update_updated_at() trigger
--   * snake_case identifiers throughout

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";      -- pgvector: AI semantic similarity
create extension if not exists "pg_trgm";     -- fuzzy / trigram search

-- Utility: auto-update updated_at on any row modification
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

comment on function public.update_updated_at() is
  'Generic BEFORE UPDATE trigger to keep updated_at current.';

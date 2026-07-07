-- Authentication profiles + role-based access control
-- Created: 2026-07-07
-- Purpose: mirror auth.users into a public profiles table, model the four
--          business roles, and expose SECURITY DEFINER helpers used by RLS.

-- Business roles for the platform.
do $$ begin
  create type public.app_role as enum ('client', 'developer', 'manager', 'administrator');
exception when duplicate_object then null; end $$;

-- One profile row per auth user. Populated by a trigger on auth.users.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  role          public.app_role not null default 'client',
  team_id       uuid,                          -- FK added after teams table exists
  avatar_url    text,
  phone         text,
  is_active     boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_team on public.profiles(team_id);

-- Auto-provision a profile whenever a new auth user is created. The role can be
-- seeded from the signup metadata (raw_user_meta_data->>'role'); defaults to client.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER so policies can read profiles without
-- recursing into profiles' own RLS).
-- ---------------------------------------------------------------------------
-- NB: named current_app_role (not current_role) to avoid clashing with the
-- SQL-standard reserved current_role special function.
create or replace function public.current_app_role()
returns public.app_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function public.has_role(target public.app_role)
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = target);
$$ language sql stable security definer set search_path = public;

-- Managers and administrators have organisation-wide visibility.
create or replace function public.is_staff()
returns boolean as $$
  select public.current_app_role() in ('manager', 'administrator');
$$ language sql stable security definer set search_path = public;

create or replace function public.is_admin()
returns boolean as $$
  select public.current_app_role() = 'administrator';
$$ language sql stable security definer set search_path = public;

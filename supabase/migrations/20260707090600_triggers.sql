-- Business-logic triggers & functions
-- Created: 2026-07-07
-- Purpose: incident number assignment, status-transition history, SLA target
--          derivation, breach flagging, audit logging and notification fan-out.

-- ---------------------------------------------------------------------------
-- 1. Assign a human-friendly incident_number on insert (INC-000000 padded).
-- ---------------------------------------------------------------------------
create or replace function public.assign_incident_number()
returns trigger as $$
begin
  if new.incident_number is null then
    new.incident_number := 'INC-' || lpad(nextval('public.incident_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_incidents_number on public.incidents;
create trigger trg_incidents_number
  before insert on public.incidents
  for each row execute function public.assign_incident_number();

-- ---------------------------------------------------------------------------
-- 2. Derive SLA targets from the matching sla_policy (or priority defaults).
--    Runs when priority/severity is set or changed and no explicit due is set.
-- ---------------------------------------------------------------------------
create or replace function public.derive_incident_sla()
returns trigger as $$
declare
  pol public.sla_policies%rowtype;
  resp_mins int;
  resv_mins int;
  base_ts timestamptz := coalesce(new.created_at, now());
begin
  -- Find the best-matching active policy: prefer priority+severity match.
  select * into pol
  from public.sla_policies
  where is_active
    and (priority_id = new.priority_id or priority_id is null)
    and (severity_id = new.severity_id or severity_id is null)
  order by (priority_id is not null)::int + (severity_id is not null)::int desc
  limit 1;

  if pol.id is not null then
    new.sla_policy_id := pol.id;
    resp_mins := pol.response_mins;
    resv_mins := pol.resolve_mins;
  else
    -- Fall back to priority defaults.
    select default_response_mins, default_resolve_mins into resp_mins, resv_mins
    from public.priorities where id = new.priority_id;
  end if;

  if resp_mins is not null and new.sla_response_due is null then
    new.sla_response_due := base_ts + make_interval(mins => resp_mins);
  end if;
  if resv_mins is not null and new.sla_resolve_due is null then
    new.sla_resolve_due := base_ts + make_interval(mins => resv_mins);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_incidents_sla on public.incidents;
create trigger trg_incidents_sla
  before insert on public.incidents
  for each row execute function public.derive_incident_sla();

-- ---------------------------------------------------------------------------
-- 3. Record status transitions + stamp resolved/closed timestamps + breaches.
-- ---------------------------------------------------------------------------
create or replace function public.track_incident_status()
returns trigger as $$
declare
  st public.statuses%rowtype;
begin
  -- On insert: open the first history segment.
  if tg_op = 'INSERT' then
    insert into public.incident_status_history (incident_id, to_status_id, changed_by, entered_at)
    values (new.id, new.status_id, new.reporter_id, new.created_at);
    return new;
  end if;

  -- On status change: close the previous segment, open a new one.
  if new.status_id is distinct from old.status_id then
    update public.incident_status_history
      set exited_at = now()
      where incident_id = new.id and exited_at is null;

    insert into public.incident_status_history (incident_id, from_status_id, to_status_id, changed_by, entered_at)
    values (new.id, old.status_id, new.status_id, auth.uid(), now());

    -- Stamp lifecycle timestamps based on the new status semantics.
    select * into st from public.statuses where id = new.status_id;
    if st.key = 'resolved' and new.resolved_at is null then
      new.resolved_at := now();
    elsif st.key = 'closed' and new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;

  -- Stamp first response the first time a non-reporter interacts (approximation:
  -- when it leaves the initial "new" state).
  if new.first_responded_at is null and new.status_id is distinct from old.status_id then
    new.first_responded_at := now();
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_incidents_status_ins on public.incidents;
create trigger trg_incidents_status_ins
  after insert on public.incidents
  for each row execute function public.track_incident_status();

drop trigger if exists trg_incidents_status_upd on public.incidents;
create trigger trg_incidents_status_upd
  before update on public.incidents
  for each row execute function public.track_incident_status();

-- ---------------------------------------------------------------------------
-- 4. Generic audit logging for incidents.
-- ---------------------------------------------------------------------------
create or replace function public.audit_incident()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, summary, changes)
    values (new.reporter_id, 'incident.created', 'incident', new.id,
            'Incident ' || coalesce(new.incident_number, '') || ' created',
            jsonb_build_object('after', to_jsonb(new)));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, summary, changes)
    values (auth.uid(),
            case when new.status_id is distinct from old.status_id then 'incident.status_changed'
                 when new.assigned_to is distinct from old.assigned_to then 'incident.reassigned'
                 else 'incident.updated' end,
            'incident', new.id,
            'Incident ' || coalesce(new.incident_number, '') || ' updated',
            jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_incidents_audit on public.incidents;
create trigger trg_incidents_audit
  after insert or update on public.incidents
  for each row execute function public.audit_incident();

-- ---------------------------------------------------------------------------
-- 5. Notification fan-out on assignment / status change.
-- ---------------------------------------------------------------------------
create or replace function public.notify_incident_change()
returns trigger as $$
begin
  -- Notify a newly assigned developer.
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    insert into public.notifications (user_id, type, title, body, incident_id)
    values (new.assigned_to, 'assignment',
            'Incident assigned: ' || coalesce(new.incident_number, ''),
            new.title, new.id);
  end if;

  -- Notify the reporter of status changes.
  if new.status_id is distinct from old.status_id and new.reporter_id is not null then
    insert into public.notifications (user_id, type, title, body, incident_id)
    values (new.reporter_id, 'status_change',
            'Status updated: ' || coalesce(new.incident_number, ''),
            'Your incident status changed.', new.id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_incidents_notify on public.incidents;
create trigger trg_incidents_notify
  after update on public.incidents
  for each row execute function public.notify_incident_change();

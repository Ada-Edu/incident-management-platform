-- Analytics views for dashboards & reporting
-- Created: 2026-07-07
-- Purpose: denormalised, query-friendly views. All use security_invoker so the
--          caller's RLS on the underlying incidents table still applies.

-- Fully-joined incident view (labels resolved). Used by list/detail/console.
create or replace view public.v_incidents
with (security_invoker = on) as
select
  i.id,
  i.incident_number,
  i.zendesk_ticket_id,
  i.title,
  i.description,
  i.root_cause,
  i.resolution_notes,
  i.workaround,
  i.created_at,
  i.updated_at,
  i.resolved_at,
  i.closed_at,
  i.first_responded_at,
  i.sla_response_due,
  i.sla_resolve_due,
  i.response_breached,
  i.resolve_breached,
  i.ai_confidence,
  i.ai_self_resolved,
  c.name  as category,
  c.id    as category_id,
  sc.name as subcategory,
  p.name  as priority,
  p.rank  as priority_rank,
  p.color as priority_color,
  p.id    as priority_id,
  sev.name as severity,
  sev.rank as severity_rank,
  env.name as environment,
  st.key  as status_key,
  st.name as status,
  st.is_open,
  st.is_terminal,
  st.color as status_color,
  st.id   as status_id,
  cust.name as customer,
  cust.id   as customer_id,
  rep.full_name as reporter_name,
  rep.id        as reporter_id,
  dev.full_name as assignee_name,
  dev.id        as assigned_to,
  tm.name as team_name,
  tm.id   as assigned_team_id,
  -- Live SLA countdown fields (seconds; negative = breached).
  case when st.is_terminal then null
       else extract(epoch from (i.sla_resolve_due - now())) end as sla_seconds_remaining
from public.incidents i
left join public.categories c    on c.id = i.category_id
left join public.categories sc   on sc.id = i.subcategory_id
left join public.priorities p    on p.id = i.priority_id
left join public.severities sev  on sev.id = i.severity_id
left join public.environments env on env.id = i.environment_id
left join public.statuses st     on st.id = i.status_id
left join public.customers cust  on cust.id = i.customer_id
left join public.profiles rep    on rep.id = i.reporter_id
left join public.profiles dev    on dev.id = i.assigned_to
left join public.teams tm        on tm.id = i.assigned_team_id;

-- Dashboard KPI rollup (single row).
create or replace view public.v_dashboard_kpis
with (security_invoker = on) as
select
  count(*)                                          as total_incidents,
  count(*) filter (where is_open)                   as open_incidents,
  count(*) filter (where is_terminal)               as closed_incidents,
  count(*) filter (where status_key = 'in_progress') as in_progress,
  count(*) filter (where severity_rank = 1)         as critical_incidents,
  count(*) filter (where priority_rank = 1)         as high_priority,
  count(*) filter (where resolve_breached)          as breached,
  -- SLA compliance %: resolved incidents that did not breach.
  round(
    100.0 * count(*) filter (where is_terminal and not resolve_breached)
    / nullif(count(*) filter (where is_terminal), 0)
  , 1)                                              as sla_compliance_pct,
  -- Avg resolution time (hours).
  round(avg(extract(epoch from (resolved_at - created_at)) / 3600.0)
        filter (where resolved_at is not null)::numeric, 1) as avg_resolution_hours,
  round(avg(extract(epoch from (first_responded_at - created_at)) / 3600.0)
        filter (where first_responded_at is not null)::numeric, 1) as avg_first_response_hours
from public.v_incidents;

-- Grouped breakdowns for charts.
create or replace view public.v_incidents_by_priority
with (security_invoker = on) as
select coalesce(priority, 'Unassigned') as label, priority_color as color, count(*) as value
from public.v_incidents group by priority, priority_color, priority_rank order by priority_rank nulls last;

create or replace view public.v_incidents_by_category
with (security_invoker = on) as
select coalesce(category, 'Uncategorised') as label, count(*) as value
from public.v_incidents group by category order by value desc;

create or replace view public.v_incidents_by_team
with (security_invoker = on) as
select coalesce(team_name, 'Unassigned') as label, count(*) as value
from public.v_incidents group by team_name order by value desc;

create or replace view public.v_incidents_by_developer
with (security_invoker = on) as
select coalesce(assignee_name, 'Unassigned') as label, count(*) as value
from public.v_incidents group by assignee_name order by value desc;

-- Daily trend (last 30 days).
create or replace view public.v_incident_daily_trend
with (security_invoker = on) as
select date_trunc('day', created_at)::date as day, count(*) as value
from public.v_incidents
where created_at >= now() - interval '30 days'
group by 1 order by 1;

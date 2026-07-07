# Database

PostgreSQL 17 via Supabase. Migrations are timestamped and applied in order by
`supabase db reset`. Conventions follow the project template: UUID PKs
(`gen_random_uuid()`), `created_at`/`updated_at` on every table, the shared
`update_updated_at()` trigger, JSONB for flexible payloads, and RLS everywhere.

## Migrations

| File | Contents |
|------|----------|
| `…090000_extensions_and_utils.sql` | `pgcrypto`, `vector`, `pg_trgm`; `update_updated_at()` |
| `…090100_auth_profiles_roles.sql`  | `app_role` enum, `profiles`, new-user trigger, RLS helpers |
| `…090200_reference_data.sql`       | teams, categories, priorities, severities, environments, statuses, customers, sla_policies |
| `…090300_incidents.sql`            | `incidents` + status history, comments, attachments, assignments |
| `…090400_ai_knowledge.sql`         | KB articles, `knowledge_embeddings` (pgvector), `ai_interactions`, `match_knowledge()` |
| `…090500_audit_notifications_sync.sql` | audit_log, notifications, zendesk_sync_log, system_settings |
| `…090600_triggers.sql`             | numbering, SLA derivation, status history, audit, notifications |
| `…090700_rls_policies.sql`         | RLS enable + policies for all tables |
| `…090800_views_analytics.sql`      | `v_incidents` + dashboard/report views (`security_invoker`) |

`seed.sql` loads reference data, SLA policies, demo customers and KB articles.

## Core tables

- **profiles** — one row per `auth.users` id, carries `role` and `team_id`.
- **incidents** — the central entity. Soft references to all lookups; SLA
  columns (`sla_response_due`, `sla_resolve_due`, breach flags); resolution
  knowledge (`root_cause`, `resolution_notes`, `workaround`); AI fields
  (`ai_confidence`, `ai_self_resolved`).
- **incident_status_history** — one segment per status; powers the timeline and
  time-in-stage analytics.
- **incident_comments / _attachments / _assignments** — satellites.
- **knowledge_embeddings** — unified `vector(1536)` store for incidents + KB,
  queried by `match_knowledge()` (cosine, ivfflat index).

## Roles & RLS

| Role | Incidents visible | Writes |
|------|-------------------|--------|
| client | rows they reported | create incidents, own comments |
| developer | assigned to them or their team | update assigned incidents, comments |
| manager | all | assign/reassign, bulk, all updates |
| administrator | all | + user management, configuration |

Policies use SECURITY DEFINER helpers (`current_role()`, `is_staff()`,
`is_admin()`, `can_see_incident()`) to avoid recursive RLS. Reference tables are
readable by all authenticated users, writable only by admins.

## Key triggers

- `assign_incident_number` → `INC-000000`-style numbers from a sequence.
- `derive_incident_sla` → picks the best-matching `sla_policy` (falls back to
  priority defaults) and stamps `sla_*_due`.
- `track_incident_status` → maintains history segments and stamps
  `resolved_at`/`closed_at`/`first_responded_at`.
- `audit_incident` / `notify_incident_change` → audit rows + notifications.

## Extending
- Add a `dim_*`-style lookup or a new reference table, then reference it via a
  soft `*_id` column on `incidents` (mirrors the template's dimension pattern).
- New integrations reuse `zendesk_sync_log` (or add sibling tables) + the
  status/priority mapping approach.
- To enable the "learn from resolved incidents" loop, add a trigger on
  `incidents` resolve that enqueues a re-embed into `knowledge_embeddings`.

# Architecture

## Overview

```
┌──────────────┐     Supabase JS (JWT)      ┌───────────────────────────┐
│  React SPA    │ ─────────────────────────▶ │  Supabase                  │
│ (Vite + TS)   │                            │  ├─ PostgreSQL (+ RLS)      │
│               │  invoke() edge functions   │  ├─ Auth (email/password)  │
│  TanStack     │ ─────────────────────────▶ │  ├─ Storage (attachments)  │
│  Query        │                            │  └─ Edge Functions (Deno)  │
└──────────────┘                            └───────────┬───────────────┘
                                                         │
                              ┌──────────────────────────┼───────────────────────┐
                              ▼                          ▼                        ▼
                       ai-assistant                  chatbot                 zendesk-sync
                    (embed + match_knowledge)   (intent + live query)   (Zendesk REST API)
                              │                                                  │
                              ▼                                                  ▼
                        OpenAI API                                        Zendesk API
```

## Layers

### 1. Database (source of truth + security boundary)
- **Dedicated relational schema** for the incident domain (see
  [DATABASE.md](DATABASE.md)) — chosen over the template's generic entity model
  because incident management is richly relational and SLA/analytics queries
  benefit from real columns and indexes.
- **Row Level Security** is the authoritative access control. Every table has
  RLS enabled; helper functions (`current_role()`, `is_staff()`,
  `can_see_incident()`) keep policies readable. The frontend's RBAC
  (`src/auth/rbac.ts`) only mirrors this for UX — it is never trusted.
- **Triggers** encapsulate business rules: incident numbering, SLA target
  derivation, status-transition history, audit logging, and notification
  fan-out. Keeping these in the database means every write path (UI, edge
  function, Zendesk sync) gets consistent behaviour.
- **Views** (`v_incidents`, `v_dashboard_kpis`, …) use `security_invoker=on` so
  the caller's RLS still applies — dashboards can't leak rows.

### 2. Edge functions (trusted server logic)
- `ai-assistant` — embeds the incident text, calls `match_knowledge` (pgvector
  cosine search) across incidents + KB articles, then asks the LLM to synthesise
  a structured answer. Degrades to trigram search when no API key is set.
- `chatbot` — deterministic intent routing runs **RLS-scoped** reads (via the
  caller's JWT), then the LLM phrases an answer grounded in that live data, so
  it can't invent or leak.
- `zendesk-sync` — pulls/updates tickets using the service role, maps
  status/priority, and logs every run. Per-ticket error isolation.

### 3. Frontend
- **AuthProvider** wraps Supabase Auth and loads the user's `profile` (role).
- **ProtectedRoute** guards routes by session + permission.
- **TanStack Query** hooks (`src/hooks/*`) own all data fetching/caching; the
  dashboard uses `refetchInterval` for near-real-time updates.
- **shadcn/ui** primitives under `src/components/ui`; domain components under
  `src/components/{incidents,dashboard,chatbot,layout}`.

## Data flow: logging an incident with AI
1. User fills the form → on blur, `ai-assistant` is invoked.
2. The assistant returns similar incidents + confidence.
3. If confidence ≥ threshold, the UI suggests self-resolution.
4. On submit, `incidents` insert fires triggers: number assignment, SLA
   derivation, first status-history segment, audit entry.

## Security
- RLS on every table; secrets only in edge-function env / Supabase Vault.
- Anon key is public by design (RLS enforces access); service role key is
  server-only.
- Input validation in the UI + `not null`/`check` constraints in the DB.
- Full audit trail in `audit_log`.
- See the OWASP notes in [DEPLOYMENT.md](DEPLOYMENT.md#security-hardening).

## Future readiness (roadmap)
The integration pattern (edge function + sync-log table + status/priority
mapping) generalises to **Azure DevOps, Jira, ServiceNow, Teams, Slack, email**
without schema changes: add a new function and reuse `zendesk_sync_log`
(rename to `integration_sync_log`) or add per-integration rows. The soft-linked
lookups and JSONB `metadata` columns absorb provider-specific fields.

Remaining depth to add on the foundation:
- Realtime subscriptions (Supabase Realtime) for live incident/notification push.
- Bulk operations + timeline view in the manager console.
- Server-rendered PDF/Excel reports via a `reports` edge function.
- An embedding backfill job (trigger on incident resolve → enqueue re-embed) to
  close the "continuously learn" loop.

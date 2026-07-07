# AI-Powered Incident Management Platform

An enterprise incident management platform: React + TypeScript frontend, Supabase
(PostgreSQL + Auth + Edge Functions) backend, Zendesk synchronisation, and an
AI knowledge assistant that surfaces known solutions before an incident is
assigned to a support team.

Built on the conventions of the internal project template (UUID keys, SCD-style
history, JSONB metadata, Row Level Security, timestamped migrations).

## Stack

| Layer         | Technology |
|---------------|------------|
| Frontend      | React 18 + TypeScript, Vite |
| UI            | Tailwind CSS v4 + shadcn/ui (Radix) |
| Data/state    | TanStack Query |
| Routing       | React Router |
| Charts        | Recharts |
| Backend       | Supabase (PostgreSQL 17, Auth, Edge Functions) |
| AI            | OpenAI (configurable) + pgvector semantic search |
| Integration   | Zendesk REST API / webhooks |

## Features

- **Role-based access** (client, developer, manager, administrator) enforced by
  Postgres RLS **and** mirrored in the UI.
- **AI Knowledge Assistant** — semantic search over past incidents + KB articles
  on intake, with root cause / resolution steps / workaround / confidence, and a
  self-resolution suggestion when confidence is high.
- **Global AI chatbot** — natural-language questions answered from live,
  RLS-scoped data ("Which incidents breached SLA?", "Status of INC-001042?").
- **Executive dashboard** — KPIs + Recharts visualisations, auto-refreshing.
- **Incident workflow** — status pipeline with a timeline, SLA countdowns, and
  full audit trail.
- **Manager console** — table + kanban views over all incidents.
- **Zendesk sync** — inbound ticket import/update with a sync history log.
- **Reports** — SLA compliance, developer/team performance, CSV/PDF export.

## Quick start

```bash
# 1. Backend
supabase start                 # Postgres + Auth + Studio + Edge runtime
supabase db reset              # apply migrations + seed
supabase functions serve       # serve edge functions locally

# 2. Frontend
cd frontend
cp ../.env.example .env         # then paste the anon key from `supabase status`
npm install
npm run dev                     # http://localhost:3000
```

Create your first users via Supabase Studio (Auth → Users) or the app, then set
roles in the `profiles` table. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design & data flow
- [docs/DATABASE.md](docs/DATABASE.md) — schema, RLS model, migrations
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — setup, secrets, production deploy

## Status

This is the **foundation + one complete vertical slice** (auth → dashboard →
incident list → create-with-AI → detail/workflow). Manager console, reports and
admin are functional but intentionally lighter; extension points are documented
inline. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#roadmap).

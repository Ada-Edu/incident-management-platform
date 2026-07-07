# Deployment Guide

## Prerequisites
- Node 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker Desktop
- (Optional) OpenAI API key, Zendesk API token

## Local development

```bash
# 1. Start Supabase (Postgres, Auth, Studio, Edge runtime)
supabase start

# 2. Apply schema + seed
supabase db reset

# 3. Grab local keys
supabase status         # copy anon key + service_role key

# 4. Serve edge functions (with secrets)
supabase functions serve --env-file .env

# 5. Frontend
cd frontend
cp ../.env.example .env  # paste VITE_SUPABASE_ANON_KEY from `supabase status`
npm install
npm run dev              # http://localhost:3000
```

Studio: http://localhost:54323 · API: http://localhost:54321

## Creating users & roles
1. Supabase Studio → Authentication → Add user (email + password). A `profiles`
   row is created automatically by the `on_auth_user_created` trigger.
2. Set the role in Studio → Table editor → `profiles.role`
   (`client` | `developer` | `manager` | `administrator`).
3. Optionally set `team_id` for developers.

Signups can also carry a role via `raw_user_meta_data.role` (used by the trigger).

## Secrets

Set edge-function secrets (never commit them):

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set AI_MODEL=gpt-4o-mini
supabase secrets set ZENDESK_SUBDOMAIN=mycompany
supabase secrets set ZENDESK_EMAIL=agent@mycompany.com
supabase secrets set ZENDESK_API_TOKEN=...
```

Without `OPENAI_API_KEY`, the assistant/chatbot fall back to keyword/trigram
search so the app remains usable.

## Production

1. **Create a hosted Supabase project**, then link and push:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   supabase functions deploy ai-assistant chatbot zendesk-sync
   supabase secrets set ...   # production secrets
   ```
2. **Auth**: enable email confirmation (`[auth.email].enable_confirmations`),
   set the production `site_url` and redirect URLs.
3. **Frontend**: `npm run build` → deploy `dist/` to any static host
   (Vercel/Netlify/S3+CloudFront). Set `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL` at build time.
4. **Storage**: create an `attachments` bucket with RLS matching
   `can_see_incident`.
5. **Zendesk scheduling**: schedule `zendesk-sync` via `pg_cron` or an external
   scheduler hitting the function URL; or register a Zendesk webhook that POSTs
   `{ ticket }` to the function.

## Security hardening (OWASP)
- RLS enforced on every table; verify with the Supabase advisor.
- Service-role key server-only; anon key is safe client-side.
- Enable email confirmation + strong password policy in Auth settings.
- Rate-limit edge functions; validate all input.
- Rotate API tokens; store in Vault/secrets, not `system_settings`.
- Enable Postgres SSL and least-privilege DB roles in production.

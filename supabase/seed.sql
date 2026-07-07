-- Seed data for the Incident Management Platform (local/dev)
-- Order follows template guidance: reference/lookup rows first, then policies,
-- then demo content. Users are created via Supabase Auth (see docs/DEPLOYMENT.md),
-- so no rows are inserted into auth.users here.

-- Statuses (workflow pipeline) ------------------------------------------------
insert into public.statuses (key, name, sort_order, is_open, is_terminal, color) values
  ('new',                  'New',                  1,  true,  false, '#64748b'),
  ('open',                 'Open',                 2,  true,  false, '#3b82f6'),
  ('assigned',             'Assigned',             3,  true,  false, '#6366f1'),
  ('in_progress',          'In Progress',          4,  true,  false, '#8b5cf6'),
  ('waiting_customer',     'Waiting for Customer', 5,  true,  false, '#f59e0b'),
  ('waiting_third_party',  'Waiting for Third Party',6, true, false, '#f97316'),
  ('testing',              'Testing',              7,  true,  false, '#14b8a6'),
  ('ready_for_deployment', 'Ready for Deployment', 8,  true,  false, '#0ea5e9'),
  ('resolved',             'Resolved',             9,  false, true,  '#22c55e'),
  ('closed',               'Closed',               10, false, true,  '#6b7280')
on conflict (key) do nothing;

-- Priorities ------------------------------------------------------------------
insert into public.priorities (key, name, rank, color, default_response_mins, default_resolve_mins) values
  ('critical', 'Critical', 1, '#dc2626', 15,   240),
  ('high',     'High',     2, '#f97316', 60,   480),
  ('medium',   'Medium',   3, '#f59e0b', 240,  1440),
  ('low',      'Low',      4, '#22c55e', 480,  4320)
on conflict (key) do nothing;

-- Severities ------------------------------------------------------------------
insert into public.severities (key, name, rank, color) values
  ('sev1', 'Sev 1 - Critical', 1, '#dc2626'),
  ('sev2', 'Sev 2 - Major',    2, '#f97316'),
  ('sev3', 'Sev 3 - Moderate', 3, '#f59e0b'),
  ('sev4', 'Sev 4 - Minor',    4, '#22c55e')
on conflict (key) do nothing;

-- Environments ----------------------------------------------------------------
insert into public.environments (key, name) values
  ('production', 'Production'),
  ('staging',    'Staging'),
  ('development','Development'),
  ('test',       'Test')
on conflict (key) do nothing;

-- Teams -----------------------------------------------------------------------
insert into public.teams (name, description) values
  ('Platform',      'Core platform & infrastructure'),
  ('Applications',  'Business applications support'),
  ('Networking',    'Network & connectivity'),
  ('Service Desk',  'First-line triage')
on conflict (name) do nothing;

-- Categories (top-level) ------------------------------------------------------
insert into public.categories (key, name, sort_order) values
  ('access',       'Access & Authentication', 1),
  ('connectivity', 'Connectivity & Network',  2),
  ('email',        'Email & Collaboration',   3),
  ('application',  'Application Errors',      4),
  ('hardware',     'Hardware',                5)
on conflict (key) do nothing;

-- Subcategories (parent -> child) --------------------------------------------
insert into public.categories (key, name, sort_order, parent_id)
select 'access_password', 'Password / Login', 1, id from public.categories where key = 'access'
on conflict (key) do nothing;
insert into public.categories (key, name, sort_order, parent_id)
select 'access_vpn', 'VPN', 2, id from public.categories where key = 'connectivity'
on conflict (key) do nothing;
insert into public.categories (key, name, sort_order, parent_id)
select 'email_outlook', 'Outlook', 1, id from public.categories where key = 'email'
on conflict (key) do nothing;

-- SLA policies (one per priority) --------------------------------------------
insert into public.sla_policies (name, priority_id, response_mins, resolve_mins)
select 'Critical SLA', id, 15,  240  from public.priorities where key = 'critical'
on conflict do nothing;
insert into public.sla_policies (name, priority_id, response_mins, resolve_mins)
select 'High SLA', id, 60,  480  from public.priorities where key = 'high'
on conflict do nothing;
insert into public.sla_policies (name, priority_id, response_mins, resolve_mins)
select 'Medium SLA', id, 240, 1440 from public.priorities where key = 'medium'
on conflict do nothing;
insert into public.sla_policies (name, priority_id, response_mins, resolve_mins)
select 'Low SLA', id, 480, 4320 from public.priorities where key = 'low'
on conflict do nothing;

-- Demo customers --------------------------------------------------------------
insert into public.customers (name, domain, contact_email) values
  ('Contoso Ltd',   'contoso.com',   'it@contoso.com'),
  ('Fabrikam Inc',  'fabrikam.com',  'support@fabrikam.com'),
  ('Northwind Co',  'northwind.com', 'help@northwind.com')
on conflict do nothing;

-- Knowledge base seed articles (used by the AI assistant fallback) ------------
insert into public.kb_articles (title, body, tags) values
  ('How to reset your password',
   'If you are locked out, use the company self-service portal at portal.example.com/reset. Passwords expire every 90 days. If the reset email does not arrive within 5 minutes, check your spam folder or contact the Service Desk.',
   array['password','access','login']),
  ('Resolving VPN connection failures',
   'Most VPN failures are caused by expired credentials or an out-of-date client. 1) Reset your password. 2) Update the VPN client to the latest version. 3) Confirm you are not on a blocked network. 4) Restart the client.',
   array['vpn','connectivity','network']),
  ('Outlook cannot connect to server',
   'When Outlook cannot connect: 1) Verify internet connectivity. 2) Confirm your mailbox is not over quota. 3) Recreate the Outlook profile. 4) Clear cached credentials in Credential Manager. Expired passwords are the most common root cause.',
   array['outlook','email'])
on conflict do nothing;

-- Non-secret system settings --------------------------------------------------
insert into public.system_settings (key, value, description) values
  ('zendesk.config', '{"subdomain": "", "enabled": false, "sync_interval_mins": 15}', 'Zendesk integration configuration (secrets stored in edge function env / Vault)'),
  ('ai.config', '{"provider": "openai", "model": "gpt-4o-mini", "embedding_model": "text-embedding-3-small", "auto_suggest_threshold": 0.82}', 'AI provider configuration'),
  ('sla.business_hours', '{"start": "08:00", "end": "18:00", "timezone": "Africa/Johannesburg", "workdays": [1,2,3,4,5]}', 'Business hours for business-hours-only SLAs')
on conflict (key) do nothing;

-- AI knowledge & semantic similarity layer
-- Created: 2026-07-07
-- Purpose: knowledge base, vector embeddings for incidents + KB articles, an
--          AI interaction log, and the semantic match RPC used by the assistant.
--
-- Embedding dimension: 1536 (OpenAI text-embedding-3-small). Adjust the vector
-- size here and in the edge functions if you switch providers.

-- Internal knowledge base articles (FAQ / runbooks / known workarounds).
create table if not exists public.kb_articles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  category_id  uuid references public.categories(id) on delete set null,
  tags         text[] not null default '{}',
  is_published boolean not null default true,
  author_id    uuid references public.profiles(id) on delete set null,
  view_count   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_kb_articles_updated_at
  before update on public.kb_articles
  for each row execute function public.update_updated_at();
create index if not exists idx_kb_title_trgm on public.kb_articles using gin (title gin_trgm_ops);

-- Unified embedding store. Each row embeds either an incident or a KB article,
-- so the assistant can search both corpora with one similarity query.
create table if not exists public.knowledge_embeddings (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null check (source_type in ('incident', 'kb_article')),
  source_id     uuid not null,
  content       text not null,                 -- the text that was embedded
  embedding     vector(1536),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint uq_embedding_source unique (source_type, source_id)
);
create trigger trg_knowledge_embeddings_updated_at
  before update on public.knowledge_embeddings
  for each row execute function public.update_updated_at();

-- Approximate nearest-neighbour index (cosine). ivfflat needs data to train on;
-- it is created here and Postgres will use it once rows exist.
create index if not exists idx_knowledge_embeddings_vec
  on public.knowledge_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Log of every AI assistant / chatbot interaction (for audit + learning loop).
create table if not exists public.ai_interactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete set null,
  incident_id    uuid references public.incidents(id) on delete set null,
  kind           text not null default 'assistant',   -- assistant | chatbot
  prompt         text not null,
  response       text,
  matched_ids    uuid[] not null default '{}',
  confidence     numeric,
  was_helpful    boolean,                              -- user feedback for learning
  created_at     timestamptz not null default now()
);
create index if not exists idx_ai_interactions_user on public.ai_interactions(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Semantic match RPC. Returns the most similar embedded items to a query
-- vector, optionally filtered by source_type. Called from the ai-assistant
-- edge function after it computes the query embedding.
-- ---------------------------------------------------------------------------
create or replace function public.match_knowledge(
  query_embedding vector(1536),
  match_count int default 5,
  filter_source_type text default null,
  similarity_threshold float default 0.0
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    ke.id,
    ke.source_type,
    ke.source_id,
    ke.content,
    ke.metadata,
    1 - (ke.embedding <=> query_embedding) as similarity
  from public.knowledge_embeddings ke
  where ke.embedding is not null
    and (filter_source_type is null or ke.source_type = filter_source_type)
    and (1 - (ke.embedding <=> query_embedding)) >= similarity_threshold
  order by ke.embedding <=> query_embedding
  limit match_count;
$$;

-- Run in Supabase SQL Editor, or: supabase db push (if using Supabase CLI linked to this project)
-- Embeddings use 1536 dimensions (e.g. OpenAI text-embedding-3-small). Adjust if your model differs.

create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- organisations
-- ---------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.organisations is 'Companies, funds, and other entities.';

-- ---------------------------------------------------------------------------
-- contacts (organisation -> organisation_id FK to organisations)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organisation_id uuid references public.organisations (id) on delete set null,
  role text,
  deal_types text[],
  min_deal_size numeric,
  max_deal_size numeric,
  sectors text[],
  geography text,
  relationship_score numeric,
  last_contact_date date,
  notes text,
  source text,
  created_at timestamptz not null default now(),
  embedding vector(1536)
);

comment on column public.contacts.organisation_id is 'Links to organisations; replaces a free-text organisation field.';
comment on column public.contacts.embedding is 'Optional embedding for semantic search over contact context (e.g. notes).';

create index contacts_embedding_hnsw on public.contacts
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  size numeric,
  sector text,
  structure text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  embedding vector(1536)
);

comment on column public.deals.embedding is 'Optional embedding for semantic search (e.g. title + notes).';

create index deals_embedding_hnsw on public.deals
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Row level security (tighten policies for your product)
-- ---------------------------------------------------------------------------
alter table public.organisations enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;

create policy "organisations_authenticated_all"
  on public.organisations
  for all
  to authenticated
  using (true)
  with check (true);

create policy "contacts_authenticated_all"
  on public.contacts
  for all
  to authenticated
  using (true)
  with check (true);

create policy "deals_authenticated_all"
  on public.deals
  for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Semantic search helpers (cosine similarity via <=> distance)
-- ---------------------------------------------------------------------------
create or replace function public.match_contacts (
  query_embedding vector(1536),
  match_threshold double precision default 0.5,
  match_count int default 10
)
returns table (
  id uuid,
  name text,
  organisation_id uuid,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.organisation_id,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.contacts c
  where c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by c.embedding <=> query_embedding asc
  limit least(match_count, 100);
$$;

create or replace function public.match_deals (
  query_embedding vector(1536),
  match_threshold double precision default 0.5,
  match_count int default 10
)
returns table (
  id uuid,
  title text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.title,
    (1 - (d.embedding <=> query_embedding))::float as similarity
  from public.deals d
  where d.embedding is not null
    and (1 - (d.embedding <=> query_embedding)) > match_threshold
  order by d.embedding <=> query_embedding asc
  limit least(match_count, 100);
$$;

grant execute on function public.match_contacts (vector, double precision, integer) to authenticated;
grant execute on function public.match_deals (vector, double precision, integer) to authenticated;

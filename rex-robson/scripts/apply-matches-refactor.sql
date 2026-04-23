-- =====================================================================
-- Matches pipeline refactor — single bundle for the Supabase SQL Editor
-- =====================================================================
-- Combines, in order:
--   1. supabase/migrations/20260422120000_create_matches_and_history.sql
--   2. supabase/migrations/20260422121000_alter_suggestions_structured_pairs.sql
--   3. supabase/migrations/20260422122000_drop_deals_and_history.sql
--
-- Paste the whole file into:
--   https://supabase.com/dashboard/project/trwtzfnhrteriyomdada/sql/new
-- and hit Run. After it succeeds, re-seed locally with:
--   npm run db:seed -- --orgs 5 --contacts 30 --matches 12 --suggestions 8
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Matches + match_stage_history
-- ---------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  contact_a_id uuid not null references public.contacts (id) on delete cascade,
  contact_b_id uuid not null references public.contacts (id) on delete cascade,
  kind text not null check (kind in ('founder_investor', 'founder_lender')),
  stage text not null default 'introduced'
    check (stage in ('introduced', 'active', 'closed')),
  outcome text check (outcome in ('won', 'lost', 'passed')),
  context text,
  notes text,
  suggestion_id uuid references public.suggestions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_distinct_parties check (contact_a_id <> contact_b_id),
  constraint matches_outcome_only_when_closed check (
    (stage = 'closed') or (outcome is null)
  )
);

comment on table public.matches is
  'Pair of contacts being introduced. Lifecycle: introduced -> active -> closed (with outcome).';

create unique index matches_open_pair_unique
  on public.matches (
    least(contact_a_id, contact_b_id),
    greatest(contact_a_id, contact_b_id),
    kind
  )
  where stage <> 'closed';

create index matches_stage_idx on public.matches (stage);
create index matches_contact_a_idx on public.matches (contact_a_id);
create index matches_contact_b_idx on public.matches (contact_b_id);

alter table public.matches enable row level security;

create policy "matches_authenticated_all"
  on public.matches
  for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.matches_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger matches_updated_at
  before update on public.matches
  for each row
  execute function public.matches_set_updated_at();

create table public.match_stage_history (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by text,
  changed_at timestamptz not null default now(),
  constraint match_stage_history_stage_check check (
    (from_stage is null or from_stage in ('introduced', 'active', 'closed'))
    and to_stage in ('introduced', 'active', 'closed')
  )
);

create index match_stage_history_match_id_changed_at_idx
  on public.match_stage_history (match_id, changed_at desc);

alter table public.match_stage_history enable row level security;

create policy "match_stage_history_authenticated_all"
  on public.match_stage_history
  for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------
-- 2. Suggestions: structured pair columns + dedupe
-- ---------------------------------------------------------------------

alter table public.suggestions
  add column if not exists contact_a_id uuid references public.contacts (id) on delete cascade,
  add column if not exists contact_b_id uuid references public.contacts (id) on delete cascade,
  add column if not exists kind text,
  add column if not exists score numeric;

alter table public.suggestions
  add constraint suggestions_kind_check
  check (kind is null or kind in ('founder_investor', 'founder_lender'));

alter table public.suggestions
  add constraint suggestions_distinct_parties
  check (
    contact_a_id is null
    or contact_b_id is null
    or contact_a_id <> contact_b_id
  );

delete from public.suggestions
where coalesce(body, '') ilike 'rex_match_pair:%'
   or coalesce(body, '') ilike '%rex_match_pair:v1:%'
   or coalesce(body, '') ilike '%rex_match_pair:v2:%';

create unique index suggestions_pair_unique
  on public.suggestions (
    least(contact_a_id, contact_b_id),
    greatest(contact_a_id, contact_b_id),
    kind
  )
  where status = 'pending'
    and contact_a_id is not null
    and contact_b_id is not null
    and kind is not null;

create index suggestions_contact_a_idx
  on public.suggestions (contact_a_id)
  where contact_a_id is not null;

create index suggestions_contact_b_idx
  on public.suggestions (contact_b_id)
  where contact_b_id is not null;

-- ---------------------------------------------------------------------
-- 3. Drop the retired deals concept
-- ---------------------------------------------------------------------

drop function if exists public.workspace_deals_page(text, int, int);
drop function if exists public.match_deals(vector, double precision, integer);

-- rex_email_extractions still carries a legacy FK to deals; drop it before the table goes.
alter table public.rex_email_extractions
  drop column if exists created_deal_id;

drop table if exists public.deal_stage_history;
drop table if exists public.deals;

commit;

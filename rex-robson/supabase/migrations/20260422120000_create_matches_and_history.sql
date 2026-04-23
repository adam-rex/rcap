-- Matches: two-contact pairings with stage + outcome lifecycle (Introduced -> Active -> Closed).
-- One open match per ordered (a,b,kind) pair is enforced at the DB level so the canvas can't
-- diverge from the user-stated rule "one suggestion per pair, one match per pair".

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

-- Canonicalised pair index: same pair in either order maps to one row when not closed.
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

-- Updated_at trigger (mirrors the pattern used elsewhere in this schema).
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

-- Stage history mirrors deal_stage_history (now retired): one append-only row per transition.
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

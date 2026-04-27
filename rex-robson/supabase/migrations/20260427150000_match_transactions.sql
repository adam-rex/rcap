-- Pipeline deals are per-transaction rows; matches stay profile-pair (opportunity) level.

create table public.match_transactions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  title text,
  stage text not null default 'active'
    check (stage in ('active', 'closed')),
  outcome text check (outcome is null or outcome in ('won', 'lost', 'passed')),
  context text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_transactions_outcome_only_when_closed check (
    (stage = 'closed') or (outcome is null)
  )
);

comment on table public.match_transactions is
  'Deal-specific pipeline rows; many can exist per match (opportunity) after an introduction.';

create index match_transactions_match_id_idx
  on public.match_transactions (match_id);

create index match_transactions_stage_idx
  on public.match_transactions (stage);

alter table public.matches
  add column if not exists introduction_at timestamptz,
  add column if not exists introduction_notes text;

-- Backfill: active-stage matches become introduced opportunities + one active transaction.
insert into public.match_transactions (match_id, stage, outcome, context, notes)
select
  id,
  'active',
  null,
  context,
  notes
from public.matches
where stage = 'active';

update public.matches
set
  stage = 'introduced',
  outcome = null
where stage = 'active';

-- Closed matches: move outcome/context/notes onto a closed transaction row.
insert into public.match_transactions (match_id, stage, outcome, context, notes)
select
  id,
  'closed',
  outcome,
  context,
  notes
from public.matches
where stage = 'closed';

update public.matches
set outcome = null
where stage = 'closed';

alter table public.matches drop constraint if exists matches_stage_check;

alter table public.matches
  add constraint matches_stage_check check (stage in ('introduced', 'closed'));

create or replace function public.match_transactions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger match_transactions_updated_at
  before update on public.match_transactions
  for each row
  execute function public.match_transactions_set_updated_at();

alter table public.match_transactions enable row level security;

create policy "match_transactions_authenticated_all"
  on public.match_transactions
  for all
  to authenticated
  using (true)
  with check (true);

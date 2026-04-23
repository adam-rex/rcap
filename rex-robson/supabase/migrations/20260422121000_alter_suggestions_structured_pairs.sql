-- Suggestions become structured pair proposals: each row is exactly one (contact_a, contact_b, kind)
-- triple. Replaces the old text-tag dedupe (`rex_match_pair:v2:<kind>:<pk>` embedded in body).

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

-- Wipe legacy text-tag suggestions so the structured rule is the only source of truth.
delete from public.suggestions
where coalesce(body, '') ilike 'rex_match_pair:%'
   or coalesce(body, '') ilike '%rex_match_pair:v1:%'
   or coalesce(body, '') ilike '%rex_match_pair:v2:%';

-- One pending suggestion per ordered pair + kind. Mirrors the new matches uniqueness rule
-- so we can't propose the same pairing twice while one is still awaiting action.
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

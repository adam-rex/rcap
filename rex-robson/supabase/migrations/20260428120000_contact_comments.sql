-- Timestamped comments on a contact (separate from free-form notes).

create table public.contact_comments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

comment on table public.contact_comments is
  'Short dated comments on a contact (activity / team discussion).';

create index contact_comments_contact_id_idx
  on public.contact_comments (contact_id, created_at desc);

alter table public.contact_comments enable row level security;

create policy "contact_comments_authenticated_all"
  on public.contact_comments
  for all
  to authenticated
  using (true)
  with check (true);

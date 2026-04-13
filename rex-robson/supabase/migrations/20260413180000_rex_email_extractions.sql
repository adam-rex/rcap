-- Rex-parsed inbox items (contacts, orgs, deal signals, intros) pending user confirmation.

alter table public.rex_inbound_emails
  add column if not exists thread_participant_count integer;

comment on column public.rex_inbound_emails.thread_participant_count is 'Optional thread size for inbox UI (set by ingest or parser).';

create table public.rex_email_extractions (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.rex_inbound_emails (id) on delete cascade,
  kind text not null
    check (kind in ('contact', 'organisation', 'deal_signal', 'intro_request')),
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'dismissed')),
  title text not null default '',
  summary text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_contact_id uuid references public.contacts (id) on delete set null,
  created_organisation_id uuid references public.organisations (id) on delete set null,
  created_deal_id uuid references public.deals (id) on delete set null,
  created_suggestion_id uuid references public.suggestions (id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.rex_email_extractions is 'Structured actions Rex proposes from an email; user applies or dismisses.';
comment on column public.rex_email_extractions.payload is 'Kind-specific fields from the parser (names, sizes, matched ids, etc.).';

create index rex_email_extractions_email_id_idx
  on public.rex_email_extractions (email_id);

create index rex_email_extractions_pending_idx
  on public.rex_email_extractions (email_id)
  where status = 'pending';

alter table public.rex_email_extractions enable row level security;

create policy "rex_email_extractions_authenticated_all"
  on public.rex_email_extractions
  for all
  to authenticated
  using (true)
  with check (true);

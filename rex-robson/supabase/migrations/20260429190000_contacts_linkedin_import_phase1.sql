-- Phase 1: LinkedIn import — profile URL and connection date on contacts.

alter table public.contacts
  add column if not exists linkedin_url text,
  add column if not exists connected_on date;

create unique index if not exists contacts_linkedin_url_unique
  on public.contacts (linkedin_url);

comment on column public.contacts.linkedin_url is
  'LinkedIn profile URL for this contact (import / manual). Null allowed; non-null values must be unique.';
comment on column public.contacts.connected_on is
  'Date the user connected with this contact on LinkedIn, when known.';

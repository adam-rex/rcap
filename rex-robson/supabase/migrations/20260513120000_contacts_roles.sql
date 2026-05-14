-- Add roles text[] to contacts: multi-select tags for what a contact does on Robson deals
-- (e.g. spv_investor, spv_borrower). Separate axis from contacts.contact_type. No backfill.

alter table public.contacts
  add column if not exists roles text[] not null default '{}';

create index if not exists contacts_roles_gin
  on public.contacts using gin (roles);

comment on column public.contacts.roles is
  'Roles this contact plays in Robson deals (multi-select). Initial slugs: spv_investor, spv_borrower. Independent of contact_type.';

-- Public profile / company page URL for a contact (manual, Quick Capture, etc.)

alter table public.contacts
  add column if not exists website_url text;

comment on column public.contacts.website_url is
  'Optional https URL for this contact (personal site, team page, company bio).';

-- Add missing contact fields used by the UI (type/sector/phone/email).

alter table public.contacts
  add column if not exists contact_type text,
  add column if not exists sector text,
  add column if not exists phone text,
  add column if not exists email text;

comment on column public.contacts.contact_type is 'High-level relationship type (Founder/Investor/Lender/Other).';
comment on column public.contacts.sector is 'Primary sector for the contact (short text).';
comment on column public.contacts.phone is 'Optional phone number for the contact.';
comment on column public.contacts.email is 'Optional email address for the contact.';


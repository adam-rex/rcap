-- Track user-archived messages (hidden from inbox, restorable from Archived view).

alter table public.rex_inbound_emails
  add column if not exists archived_at timestamptz;

comment on column public.rex_inbound_emails.archived_at is
  'When set, the message is in the Archived tab; null means active inbox.';

create index if not exists rex_inbound_emails_archived_at_idx
  on public.rex_inbound_emails (archived_at)
  where archived_at is not null;

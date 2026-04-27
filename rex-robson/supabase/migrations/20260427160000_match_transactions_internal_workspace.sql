-- Team-only comments and checklists per pipeline deal (not Rex tasks).

alter table public.match_transactions
  add column if not exists internal_comments jsonb not null default '[]'::jsonb,
  add column if not exists internal_todos jsonb not null default '[]'::jsonb;

comment on column public.match_transactions.internal_comments is
  'Internal comment log for this deal; not shown to Rex as tasks.';

comment on column public.match_transactions.internal_todos is
  'Internal checklist for this deal; not Rex tasks.';

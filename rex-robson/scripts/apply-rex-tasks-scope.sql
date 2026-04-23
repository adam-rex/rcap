-- =====================================================================
-- Rex tasks: scope + output — single bundle for the Supabase SQL Editor
-- =====================================================================
-- Applies supabase/migrations/20260423120000_rex_tasks_scope_and_output.sql
-- on top of the pre-existing rex_tasks table.
--
-- Paste the whole file into:
--   https://supabase.com/dashboard/project/trwtzfnhrteriyomdada/sql/new
-- and hit Run. After it succeeds, re-seed locally with:
--   npm run db:seed -- --orgs 5 --contacts 30 --matches 12 --suggestions 8
-- =====================================================================

begin;

alter table public.rex_tasks
  add column if not exists match_id uuid references public.matches (id) on delete cascade,
  add column if not exists contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists task_type text not null default 'custom',
  add column if not exists prompt text,
  add column if not exists output text,
  add column if not exists output_format text,
  add column if not exists error text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

comment on column public.rex_tasks.match_id is
  'Dominant link: most Rex tasks run on a match pair and draw context from both contacts.';
comment on column public.rex_tasks.contact_id is
  'Optional link for contact-scoped tasks (e.g. counterparty research without a match yet).';
comment on column public.rex_tasks.task_type is
  'Which executor to run: curated templates or custom free-text.';
comment on column public.rex_tasks.prompt is
  'User-supplied context / free-text prompt. Templates use it for extra guidance; custom tasks require it.';
comment on column public.rex_tasks.output is
  'Generated artefact (Markdown/plain text) produced by the executor. Null until the task runs.';
comment on column public.rex_tasks.output_format is
  'Shape of the output: email_draft | brief | research | summary | note.';

-- Backfill legacy rows so the new lifecycle check never trips on existing data.
update public.rex_tasks
  set started_at = coalesce(started_at, created_at)
  where status in ('done', 'running', 'dismissed');

update public.rex_tasks
  set completed_at = coalesce(completed_at, updated_at)
  where status in ('done', 'dismissed');

alter table public.rex_tasks
  drop constraint if exists rex_tasks_status_check;

alter table public.rex_tasks
  add constraint rex_tasks_status_check check (
    status in ('pending', 'running', 'done', 'dismissed', 'failed')
  );

alter table public.rex_tasks
  drop constraint if exists rex_tasks_task_type_check;

alter table public.rex_tasks
  add constraint rex_tasks_task_type_check check (
    task_type in (
      'draft_intro_email',
      'compile_match_brief',
      'research_counterparty',
      'summarise_call_notes',
      'custom'
    )
  );

alter table public.rex_tasks
  drop constraint if exists rex_tasks_output_format_check;

alter table public.rex_tasks
  add constraint rex_tasks_output_format_check check (
    output_format is null
    or output_format in ('email_draft', 'brief', 'research', 'summary', 'note')
  );

alter table public.rex_tasks
  drop constraint if exists rex_tasks_lifecycle_check;

alter table public.rex_tasks
  add constraint rex_tasks_lifecycle_check check (
    (status in ('done', 'failed') and completed_at is not null and started_at is not null)
    or status not in ('done', 'failed')
  );

create index if not exists rex_tasks_match_id_created_at_idx
  on public.rex_tasks (match_id, created_at desc)
  where match_id is not null;

create index if not exists rex_tasks_contact_id_created_at_idx
  on public.rex_tasks (contact_id, created_at desc)
  where contact_id is not null;

create index if not exists rex_tasks_task_type_idx
  on public.rex_tasks (task_type);

commit;

-- After this commits, the Tasks tab + match-card Rex strip will load. If you
-- still see "Query failed", hard-refresh the browser so the client picks up
-- the new schema.

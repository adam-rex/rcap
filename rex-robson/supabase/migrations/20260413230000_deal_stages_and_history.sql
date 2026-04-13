-- Add canonical deal stage + stage transition history for Kanban workflow.

alter table public.deals
  add column if not exists deal_stage text not null default 'prospect';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deals_deal_stage_check'
      and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals
      add constraint deals_deal_stage_check
      check (deal_stage in ('prospect', 'active', 'matching', 'closed'));
  end if;
end $$;

create table if not exists public.deal_stage_history (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by text,
  changed_at timestamptz not null default now(),
  constraint deal_stage_history_stage_check check (
    (from_stage is null or from_stage in ('prospect', 'active', 'matching', 'closed'))
    and to_stage in ('prospect', 'active', 'matching', 'closed')
  )
);

create index if not exists deal_stage_history_deal_id_changed_at_idx
  on public.deal_stage_history (deal_id, changed_at desc);

alter table public.deal_stage_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'deal_stage_history'
      and policyname = 'deal_stage_history_authenticated_all'
  ) then
    create policy "deal_stage_history_authenticated_all"
      on public.deal_stage_history
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

insert into public.deal_stage_history (deal_id, from_stage, to_stage)
select d.id, null, d.deal_stage
from public.deals d
where not exists (
  select 1
  from public.deal_stage_history h
  where h.deal_id = d.id
);

create or replace function public.workspace_deals_page (
  p_search text,
  p_page int,
  p_page_size int
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text;
  v_page int;
  v_size int;
  v_total bigint;
  v_rows json;
begin
  v_page := greatest(coalesce(p_page, 1), 1);
  v_size := least(greatest(coalesce(p_page_size, 8), 1), 50);
  v_q := nullif(trim(coalesce(p_search, '')), '');

  select count(*)::bigint into v_total
  from public.deals d
  where
    (d.status is null or d.status <> 'passed')
    and (
      v_q is null
      or d.title ilike '%' || v_q || '%'
      or coalesce(d.deal_type, '') ilike '%' || v_q || '%'
      or coalesce(d.deal_stage, '') ilike '%' || v_q || '%'
      or coalesce(d.sector, '') ilike '%' || v_q || '%'
      or coalesce(d.structure, '') ilike '%' || v_q || '%'
      or coalesce(d.status, '') ilike '%' || v_q || '%'
      or coalesce(d.notes, '') ilike '%' || v_q || '%'
      or coalesce(d.size::text, '') ilike '%' || v_q || '%'
    );

  select coalesce(json_agg(sub.obj order by sub.ord desc), '[]'::json) into v_rows
  from (
    select
      json_build_object(
        'id', d.id,
        'title', d.title,
        'size', d.size,
        'deal_type', d.deal_type,
        'deal_stage', d.deal_stage,
        'sector', d.sector,
        'structure', d.structure,
        'status', d.status
      ) as obj,
      d.created_at as ord
    from public.deals d
    where
      (d.status is null or d.status <> 'passed')
      and (
        v_q is null
        or d.title ilike '%' || v_q || '%'
        or coalesce(d.deal_type, '') ilike '%' || v_q || '%'
        or coalesce(d.deal_stage, '') ilike '%' || v_q || '%'
        or coalesce(d.sector, '') ilike '%' || v_q || '%'
        or coalesce(d.structure, '') ilike '%' || v_q || '%'
        or coalesce(d.status, '') ilike '%' || v_q || '%'
        or coalesce(d.notes, '') ilike '%' || v_q || '%'
        or coalesce(d.size::text, '') ilike '%' || v_q || '%'
      )
    order by d.created_at desc
    offset (v_page - 1) * v_size
    limit v_size
  ) sub;

  return json_build_object(
    'total', coalesce(v_total, 0),
    'rows', coalesce(v_rows, '[]'::json)
  );
end;
$$;

comment on function public.workspace_deals_page (text, int, int) is
  'Paged deal list for canvas with ILIKE search on title, stage, deal type, sector, structure, status, notes, and size.';

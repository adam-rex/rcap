-- Add optional contact_type filter to workspace_contacts_page (exact match, case-insensitive).
-- Replaces the 5-arg signature with a 6-arg version (last param defaults to all types).

drop function if exists public.workspace_contacts_page(text, int, int, text, text);

create or replace function public.workspace_contacts_page (
  p_search text,
  p_page int,
  p_page_size int,
  p_role text,
  p_organisation_type text,
  p_contact_type text default ''
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text;
  v_role text;
  v_org_type text;
  v_contact_type text;
  v_page int;
  v_size int;
  v_total bigint;
  v_rows json;
begin
  v_page := greatest(coalesce(p_page, 1), 1);
  v_size := least(greatest(coalesce(p_page_size, 12), 1), 50);
  v_q := nullif(trim(coalesce(p_search, '')), '');
  v_role := nullif(trim(coalesce(p_role, '')), '');
  v_org_type := nullif(trim(coalesce(p_organisation_type, '')), '');
  v_contact_type := nullif(trim(lower(coalesce(p_contact_type, ''))), '');

  select count(*)::bigint into v_total
  from public.contacts c
  left join public.organisations o on o.id = c.organisation_id
  where
    (v_role is null or coalesce(c.role, '') ilike '%' || v_role || '%')
    and (v_org_type is null or coalesce(o.type, '') ilike '%' || v_org_type || '%')
    and (
      v_contact_type is null
      or lower(trim(coalesce(c.contact_type, ''))) = v_contact_type
    )
    and (
      v_q is null
      or c.name ilike '%' || v_q || '%'
      or coalesce(c.contact_type, '') ilike '%' || v_q || '%'
      or coalesce(c.sector, '') ilike '%' || v_q || '%'
      or coalesce(c.internal_owner, '') ilike '%' || v_q || '%'
      or coalesce(c.role, '') ilike '%' || v_q || '%'
      or coalesce(c.notes, '') ilike '%' || v_q || '%'
      or coalesce(c.geography, '') ilike '%' || v_q || '%'
      or coalesce(o.name, '') ilike '%' || v_q || '%'
    );

  select coalesce(json_agg(sub.obj order by sub.ord desc), '[]'::json) into v_rows
  from (
    select
      json_build_object(
        'id', c.id,
        'name', c.name,
        'contact_type', c.contact_type,
        'sector', c.sector,
        'role', c.role,
        'geography', c.geography,
        'last_contact_date', c.last_contact_date,
        'organisation_id', c.organisation_id,
        'organisation_name', o.name,
        'organisation_type', o.type,
        'internal_owner', c.internal_owner
      ) as obj,
      c.created_at as ord
    from public.contacts c
    left join public.organisations o on o.id = c.organisation_id
    where
      (v_role is null or coalesce(c.role, '') ilike '%' || v_role || '%')
      and (v_org_type is null or coalesce(o.type, '') ilike '%' || v_org_type || '%')
      and (
        v_contact_type is null
        or lower(trim(coalesce(c.contact_type, ''))) = v_contact_type
      )
      and (
        v_q is null
        or c.name ilike '%' || v_q || '%'
        or coalesce(c.contact_type, '') ilike '%' || v_q || '%'
        or coalesce(c.sector, '') ilike '%' || v_q || '%'
        or coalesce(c.internal_owner, '') ilike '%' || v_q || '%'
        or coalesce(c.role, '') ilike '%' || v_q || '%'
        or coalesce(c.notes, '') ilike '%' || v_q || '%'
        or coalesce(c.geography, '') ilike '%' || v_q || '%'
        or coalesce(o.name, '') ilike '%' || v_q || '%'
      )
    order by c.created_at desc
    offset (v_page - 1) * v_size
    limit v_size
  ) sub;

  return json_build_object(
    'total', coalesce(v_total, 0),
    'rows', coalesce(v_rows, '[]'::json)
  );
end;
$$;

comment on function public.workspace_contacts_page (text, int, int, text, text, text) is
  'Paged contact list with optional role, organisation type, contact type filters, and search on name, contact type, sector, internal_owner, role, notes, geography, and organisation name.';

grant execute on function public.workspace_contacts_page (text, int, int, text, text, text) to authenticated;
grant execute on function public.workspace_contacts_page (text, int, int, text, text, text) to service_role;

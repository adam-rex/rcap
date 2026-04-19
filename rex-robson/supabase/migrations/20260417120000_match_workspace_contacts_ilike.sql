-- Single-query contact substring match (scalars + array fields as searchable text).

create or replace function public.match_workspace_contacts_ilike(
  p_pattern text,
  p_limit int default 12
)
returns table (
  id uuid,
  name text,
  role text,
  notes text,
  organisation_id uuid,
  geography text,
  contact_type text,
  sector text,
  sectors text[],
  deal_types text[],
  phone text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.role,
    c.notes,
    c.organisation_id,
    c.geography,
    c.contact_type,
    c.sector,
    c.sectors,
    c.deal_types,
    c.phone,
    c.email
  from public.contacts c
  where
    c.name ilike p_pattern
    or (c.role is not null and c.role ilike p_pattern)
    or (c.notes is not null and c.notes ilike p_pattern)
    or (c.geography is not null and c.geography ilike p_pattern)
    or (c.contact_type is not null and c.contact_type ilike p_pattern)
    or (c.sector is not null and c.sector ilike p_pattern)
    or (c.phone is not null and c.phone ilike p_pattern)
    or (c.email is not null and c.email ilike p_pattern)
    or (c.sectors is not null and array_to_string(c.sectors, ' ') ilike p_pattern)
    or (c.deal_types is not null and array_to_string(c.deal_types, ' ') ilike p_pattern)
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 25);
$$;

revoke all on function public.match_workspace_contacts_ilike(text, int) from public;
grant execute on function public.match_workspace_contacts_ilike(text, int) to authenticated;
grant execute on function public.match_workspace_contacts_ilike(text, int) to service_role;

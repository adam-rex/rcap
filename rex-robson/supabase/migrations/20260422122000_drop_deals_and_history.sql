-- Retire the deals concept entirely. Match Canvas (over public.matches) is the new
-- pipeline surface; suggestions feed it on accept. Drop in dependency order.

drop function if exists public.workspace_deals_page(text, int, int);
drop function if exists public.match_deals(vector, double precision, integer);

drop table if exists public.deal_stage_history;
drop table if exists public.deals;

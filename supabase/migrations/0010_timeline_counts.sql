-- ===========================================================================
-- Reel — timeline aggregate counts
--
-- The timeline needs to know which years and months have content, and roughly
-- how much, to draw the decades rail and skip empty months — without dragging
-- every row to the client to count them. This is a grouped query behind an RPC,
-- leaning on the existing taken_year / taken_month generated columns and their
-- indexes. Read-only and additive; no table changes.
-- ===========================================================================

create or replace function public.timeline_month_counts()
returns table (year smallint, month smallint, n integer)
language sql
stable
set search_path = ''
as $$
  select taken_year, taken_month, count(*)::int as n
    from public.media
   where status = 'ready'
   group by taken_year, taken_month
   order by taken_year desc, taken_month desc;
$$;

comment on function public.timeline_month_counts is
  'Per (year, month) ready-media counts for the timeline scaffold + decades rail. Grouped server-side so the client never counts rows.';

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 10;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied)
--
--   drop function if exists public.timeline_month_counts();
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 9; $$;
-- ===========================================================================

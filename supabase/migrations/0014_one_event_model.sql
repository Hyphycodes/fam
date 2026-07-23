-- ===========================================================================
-- Reel — one event model
--
-- Albums and events were already one physical table (kind = 'album' | 'event'),
-- so "collapse albums into events" here means retiring the distinction: every
-- collection is an event. `kind` is normalised to 'event' and left in place,
-- vestigial, to be dropped in a follow-up once verified (the same
-- drop-after-proof discipline the prompt asks for).
--
-- Two data truths get enforced:
--   * A completed event with no date isn't really completed — it's still a plan.
--     This moves such events (e.g. the 🏆 idea) to the Board and never invents a
--     now() date.
--   * From here on, a completed event MUST have a date — enforced by the DB, not
--     just the form.
--
-- And `merged_into` gives duplicate events a reversible, soft-delete merge.
-- ===========================================================================

-- 1. Retire the album/event distinction.
update public.events set kind = 'event' where kind is distinct from 'event';
alter table public.events alter column kind set default 'event';

-- 2. A completed event with no date is still a plan. (Honest, and it keeps the
--    constraint below satisfiable without inventing a date.)
update public.events set status = 'planned' where status = 'completed' and event_date is null;

-- 3. Soft-delete pointer for merges: loser -> survivor, reversible for a release.
alter table public.events add column if not exists merged_into uuid references public.events (id) on delete set null;
create index if not exists events_merged_into_idx on public.events (merged_into) where merged_into is not null;

comment on column public.events.merged_into is
  'Set when this event was merged into another (soft delete). Reads hide it; kept one release so a merge can be undone.';

-- 4. A completed event requires a date — at the database level.
alter table public.events drop constraint if exists events_completed_has_date;
alter table public.events add constraint events_completed_has_date
  check (status <> 'completed' or event_date is not null);

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 14;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied)
--
--   alter table public.events drop constraint if exists events_completed_has_date;
--   drop index if exists public.events_merged_into_idx;
--   alter table public.events drop column if exists merged_into;
--   -- (kind normalisation and planned re-status are not reversed — they are
--   --  corrections, and reversing them would reintroduce invalid data.)
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 13; $$;
-- ===========================================================================

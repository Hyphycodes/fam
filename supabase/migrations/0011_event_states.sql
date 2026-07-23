-- ===========================================================================
-- Reel — event lifecycle
--
-- An event is not always a thing that happened. Sometimes it's a flyer and an
-- idea and a group chat. These columns give an event a lifecycle so the same
-- object can carry it from "we should do this" to "here's what happened",
-- without ever splitting into two records.
--
-- Two states ship now — planned and completed — but the column allows all four
-- (planned → upcoming → live → completed) so the middle states slot in later
-- with no migration. An event's *date* stays the existing event_date (reused,
-- not duplicated — no parallel date system); starts_at/ends_at are the intended
-- window of a plan, which may be null ("sometime this summer" is a real state).
-- Additive only.
-- ===========================================================================

alter table public.events
  add column if not exists status text not null default 'completed'
    check (status in ('planned', 'upcoming', 'live', 'completed')),
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists location text;

comment on column public.events.status is
  'Lifecycle: planned | upcoming | live | completed. Existing events are completed.';
comment on column public.events.starts_at is
  'A plan''s intended start — may be null ("sometime this summer"). event_date stays the when-it-happened date.';

-- Every existing event is something that already happened.
update public.events set status = 'completed' where status is null;

-- The board reads non-completed events; the timeline reads completed ones.
create index if not exists events_status_idx on public.events (status);

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 11;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied)
--
--   drop index if exists public.events_status_idx;
--   alter table public.events
--     drop column if exists location,
--     drop column if exists ends_at,
--     drop column if exists starts_at,
--     drop column if exists status;
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 10; $$;
-- ===========================================================================

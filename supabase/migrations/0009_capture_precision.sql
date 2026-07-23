-- ===========================================================================
-- Reel — capture precision + source
--
-- `taken_at` has always been the canonical capture timestamp (it drives the
-- generated taken_month/day/year and every "on this day" lookup). What it never
-- carried was *confidence*: a real EXIF instant and a guessed upload-date looked
-- identical, so the archive could fill up with plausible-looking fake dates.
--
-- These two columns record how precise `taken_at` is and where it came from.
-- Precision governs display and honesty (a year-only date must never render a
-- month or a time); source is the archive's to-do list — everything still on
-- `upload_fallback` is a date worth confirming.
--
-- Additive only. `taken_at` itself is never rewritten here — precision changes
-- how a date is *shown*, not the stored sort key. The reused location column is
-- `media.location_text` (added in 0007); there is no separate capture-location
-- column.
-- ===========================================================================

alter table public.media
  add column if not exists taken_precision text not null default 'day'
    check (taken_precision in ('exact', 'day', 'month', 'year')),
  add column if not exists taken_source text not null default 'upload_fallback'
    check (taken_source in ('exif', 'user', 'inherited', 'upload_fallback'));

comment on column public.media.taken_precision is
  'How precise taken_at is: exact | day | month | year. Governs display, not sorting.';
comment on column public.media.taken_source is
  'Where taken_at came from: exif | user | inherited | upload_fallback. upload_fallback is the review backlog.';

-- Backfill. We cannot prove any historical taken_at came from a camera, and the
-- app already displays existing dates day-level (no time), so every existing row
-- becomes day-precision — no display changes — and is flagged upload_fallback so
-- it can be found and confirmed later. `add column ... default` above already set
-- these values; the guarded updates below only ever fill NULLs, so a hand-run
-- re-apply after real edits exist never overwrites a row a person has corrected
-- (source='user'). User edits are sacred.
update public.media
   set taken_precision = 'day'
 where taken_precision is null;
update public.media
   set taken_source = 'upload_fallback'
 where taken_source is null
   and taken_precision is distinct from 'user';

-- Stable cursor pagination for the timeline walks (taken_at, id) — never OFFSET.
create index if not exists media_taken_at_id_idx
  on public.media (taken_at desc, id desc);

-- "Everything still on a fallback date" — the cleanup backlog, indexed so it
-- stays a cheap lookup as the archive grows.
create index if not exists media_taken_source_fallback_idx
  on public.media (taken_at desc)
  where taken_source = 'upload_fallback';

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 9;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied; here for completeness/safety)
--
--   drop index if exists public.media_taken_source_fallback_idx;
--   drop index if exists public.media_taken_at_id_idx;
--   alter table public.media
--     drop column if exists taken_source,
--     drop column if exists taken_precision;
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 8; $$;
--
-- Dropping the columns is lossless for the archive: taken_at (the irreplaceable
-- part) is untouched by this migration.
-- ===========================================================================

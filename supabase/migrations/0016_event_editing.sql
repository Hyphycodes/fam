-- ===========================================================================
-- Reel — event editing provenance
--
-- 10a built event creation; 10d makes every field editable at any point in an
-- event's life (title, date, description, location, cover, status). This archive
-- gets corrected constantly — VHS dates, misfiled events, typo'd titles — so an
-- edit is a primary action, and edits must be *visible*: who last touched it and
-- when. These three columns carry that, filled by the edit route.
--
-- Nullable: null means "never edited since creation". A member or a legacy
-- account can make the edit, so both id shapes are recorded (mirroring how events
-- record their creator). Additive only.
-- ===========================================================================

alter table public.events
  add column if not exists last_edited_at timestamptz,
  add column if not exists last_edited_by uuid references public.profiles (id) on delete set null,
  add column if not exists last_edited_by_member uuid references public.members (id) on delete set null;

comment on column public.events.last_edited_at is
  'When a field was last edited after creation (null = untouched since created).';
comment on column public.events.last_edited_by is
  'Legacy (magic-link) account that made the last edit, if any.';
comment on column public.events.last_edited_by_member is
  'Passcode member that made the last edit, if any.';

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 16;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied)
--
--   alter table public.events
--     drop column if exists last_edited_by_member,
--     drop column if exists last_edited_by,
--     drop column if exists last_edited_at;
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 15; $$;
-- ===========================================================================

-- ===========================================================================
-- Reel — event artifacts
--
-- The flyer, the menu, the screenshot of the group chat arguing about the date,
-- the voice note with directions. The connective tissue of a memory that every
-- other archive throws away. Artifacts are first-class content attached to an
-- event, each rendered with intent — never a generic file blob.
--
-- Additive. Reuses the R2 upload path (storage_key) for uploaded types; `url`
-- carries link artifacts. captured_at is optional — a flyer can predate the
-- event (that's when the plan started), and when present it earns a place in the
-- Timeline.
-- ===========================================================================

create table if not exists public.event_artifacts (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  type              text not null check (type in ('flyer', 'image_doc', 'pdf', 'audio', 'link')),
  storage_key       text,              -- R2 key for uploaded types
  url               text,              -- for link type
  title             text,
  caption           text,
  captured_at       timestamptz,       -- optional; artifacts can predate the event
  sort_order        integer not null default 0,
  created_by_member uuid references public.members (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  -- An artifact is only meaningful if we can find the thing it points to.
  constraint event_artifacts_has_content check (storage_key is not null or url is not null)
);

create index if not exists event_artifacts_event_idx
  on public.event_artifacts (event_id, sort_order);
create index if not exists event_artifacts_captured_idx
  on public.event_artifacts (captured_at)
  where captured_at is not null;

comment on table public.event_artifacts is
  'Non-photo/video ephemera on an event: flyer | image_doc | pdf | audio | link. Each type has an intentional renderer.';

-- Service-role only, like the other community-write tables: every read/write
-- already goes through a server route that validated the viewer. RLS on with no
-- policy means anon/authenticated see nothing, which is exactly right.
alter table public.event_artifacts enable row level security;

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 12;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied)
--
--   drop table if exists public.event_artifacts;
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 11; $$;
-- ===========================================================================

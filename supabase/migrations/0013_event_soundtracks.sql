-- ===========================================================================
-- Reel — event soundtracks
--
-- The playlist is half the memory of a party. Attaching it to the event closes
-- the loop between the curation and the archive of the night it soundtracked.
--
-- Provider-agnostic from day one: provider + external_url + external_id, with
-- resolved metadata cached in the row so a render never refetches. Apple Music
-- ships first; adding Spotify later is one provider file and one array entry,
-- no schema change. Additive; FK cascade from the event.
-- ===========================================================================

create table if not exists public.event_soundtracks (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  provider          text not null check (provider in ('apple_music', 'spotify', 'other')),
  external_url      text not null,
  external_id       text,
  title             text,
  artwork_url       text,
  track_count       integer,
  curated_by_member uuid references public.members (id) on delete set null,
  curated_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists event_soundtracks_event_idx on public.event_soundtracks (event_id);

comment on table public.event_soundtracks is
  'A playlist attached to an event. Provider-agnostic; metadata cached in-row. UI enforces one per event; the schema allows many.';

-- Service-role only, like the other community-write tables.
alter table public.event_soundtracks enable row level security;

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 13;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied)
--
--   drop table if exists public.event_soundtracks;
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 12; $$;
-- ===========================================================================

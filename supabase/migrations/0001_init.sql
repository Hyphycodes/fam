-- ===========================================================================
-- Reel — core schema
--
-- Run this once against your Supabase project (SQL Editor, or `supabase db push`).
-- Everything is invite-only: a Postgres trigger on auth.users refuses any signup
-- whose email isn't on the allowlist, so the gate holds even if someone hits the
-- Supabase auth endpoint directly.
-- ===========================================================================

-- `gen_random_uuid()` is core Postgres since 13 (Supabase runs 15+), so there is
-- no pgcrypto dependency here.

-- ---------------------------------------------------------------------------
-- Who's allowed in
-- ---------------------------------------------------------------------------

create table if not exists public.allowed_emails (
  email        text primary key,
  role         text not null default 'family' check (role in ('owner', 'family')),
  display_name text,
  invited_by   uuid,
  invited_at   timestamptz not null default now(),
  claimed_at   timestamptz
);

comment on table public.allowed_emails is
  'The guest list. A magic link is only ever sent to an address in here.';

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text unique not null,
  display_name text not null,
  avatar_url   text,
  role         text not null default 'family' check (role in ('owner', 'family')),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events (a cookout, a trip, a christening)
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  event_date    date,
  cover_media_id uuid,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Media — the heart of it
-- ---------------------------------------------------------------------------

create table if not exists public.media (
  id                uuid primary key default gen_random_uuid(),
  uploader_id       uuid references public.profiles (id) on delete set null,
  -- Set when a memory arrives through a public event-upload link instead of a
  -- signed-in family member. Keeps "who added this" honest without an account.
  uploader_label    text,
  type              text not null check (type in ('photo', 'video')),

  -- Video lives in Cloudflare Stream…
  stream_uid        text unique,
  duration_seconds  numeric,

  -- …photos and every original file live in R2.
  r2_key            text,          -- the untouched original, always downloadable
  r2_display_key    text,          -- web-friendly derivative (HEIC -> JPEG, big -> resized)
  r2_thumb_key      text,          -- small thumb for the feed
  poster_url        text,          -- explicit poster override; videos fall back to Stream

  mime_type         text,
  original_filename text,
  byte_size         bigint,
  width             integer,
  height            integer,

  caption           text,
  favorite          boolean not null default false,
  tags              text[] not null default '{}',

  taken_at          timestamptz not null default now(),
  event_id          uuid references public.events (id) on delete set null,
  -- Set when this arrived through a public drop-off link, so that link can
  -- finish its own uploads and nobody else's.
  upload_link_id    uuid,
  status            text not null default 'processing'
                      check (status in ('processing', 'ready', 'error')),
  error_reason      text,
  created_at        timestamptz not null default now(),

  -- Denormalised month/day so "On this day" is an index lookup, not a table scan.
  -- `at time zone 'UTC'` makes the expression immutable, which a generated
  -- column requires.
  taken_month       smallint generated always as
                      (extract(month from (taken_at at time zone 'UTC'))::smallint) stored,
  taken_day         smallint generated always as
                      (extract(day from (taken_at at time zone 'UTC'))::smallint) stored,
  taken_year        smallint generated always as
                      (extract(year from (taken_at at time zone 'UTC'))::smallint) stored,

  -- A row is only meaningful if we can actually find the bytes.
  constraint media_has_a_home check (stream_uid is not null or r2_key is not null)
);

alter table public.events
  drop constraint if exists events_cover_media_id_fkey;
alter table public.events
  add constraint events_cover_media_id_fkey
  foreign key (cover_media_id) references public.media (id) on delete set null;

create index if not exists media_created_at_idx    on public.media (created_at desc);
create index if not exists media_taken_at_idx      on public.media (taken_at desc);
create index if not exists media_event_idx         on public.media (event_id);
create index if not exists media_uploader_idx      on public.media (uploader_id);
create index if not exists media_status_idx        on public.media (status) where status <> 'ready';
create index if not exists media_on_this_day_idx   on public.media (taken_month, taken_day);
create index if not exists media_year_idx          on public.media (taken_year);
create index if not exists media_favorite_idx      on public.media (favorite) where favorite;

-- ---------------------------------------------------------------------------
-- The human layer: reactions, comments, voices
-- ---------------------------------------------------------------------------

create table if not exists public.reactions (
  id         uuid primary key default gen_random_uuid(),
  media_id   uuid not null references public.media (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (media_id, user_id, emoji)
);

create index if not exists reactions_media_idx on public.reactions (media_id);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  media_id   uuid not null references public.media (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_media_idx on public.comments (media_id, created_at);

create table if not exists public.voice_notes (
  id               uuid primary key default gen_random_uuid(),
  media_id         uuid not null references public.media (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  r2_key           text not null,
  duration_seconds numeric,
  mime_type        text,
  created_at       timestamptz not null default now()
);

create index if not exists voice_notes_media_idx on public.voice_notes (media_id, created_at);

-- ---------------------------------------------------------------------------
-- Light people-tagging
-- ---------------------------------------------------------------------------

create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.media_people (
  media_id  uuid not null references public.media (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (media_id, person_id)
);

create index if not exists media_people_person_idx on public.media_people (person_id);

-- ---------------------------------------------------------------------------
-- Shareable "dump your photos here" links for an event
-- ---------------------------------------------------------------------------

create table if not exists public.event_upload_links (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  token      text not null unique,
  label      text,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_upload_links_event_idx on public.event_upload_links (event_id);

-- Declared after both tables exist, since media is created first.
alter table public.media
  drop constraint if exists media_upload_link_id_fkey;
alter table public.media
  add constraint media_upload_link_id_fkey
  foreign key (upload_link_id) references public.event_upload_links (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Music bed for Movie Mode
-- ---------------------------------------------------------------------------

create table if not exists public.music_tracks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  r2_key      text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ===========================================================================
-- Row Level Security
--
-- One rule, basically: if you have a profile row, you're family, and family can
-- see and add to everything. Deleting is restricted to the author or the owner.
-- Public event-upload links never touch RLS — they go through server routes
-- that use the service role after validating the token.
-- ===========================================================================

-- SECURITY DEFINER so the function itself is not subject to RLS on `profiles`.
-- Without that, a policy on `profiles` that calls this would recurse forever.
create or replace function public.is_family()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'
  );
$$;

alter table public.profiles           enable row level security;
alter table public.allowed_emails     enable row level security;
alter table public.events             enable row level security;
alter table public.media              enable row level security;
alter table public.reactions          enable row level security;
alter table public.comments           enable row level security;
alter table public.voice_notes        enable row level security;
alter table public.people             enable row level security;
alter table public.media_people       enable row level security;
alter table public.event_upload_links enable row level security;
alter table public.music_tracks       enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "family reads profiles" on public.profiles;
create policy "family reads profiles" on public.profiles
  for select using (public.is_family());

drop policy if exists "you edit your own profile" on public.profiles;
create policy "you edit your own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- allowed_emails (owner-only; this is the guest list) ------------------------
drop policy if exists "owner manages the guest list" on public.allowed_emails;
create policy "owner manages the guest list" on public.allowed_emails
  for all using (public.is_owner()) with check (public.is_owner());

-- A generic read/write pair for the shared family tables.
do $$
declare
  t text;
begin
  foreach t in array array['events', 'media', 'people', 'media_people', 'music_tracks']
  loop
    execute format('drop policy if exists "family reads %1$s" on public.%1$I', t);
    execute format(
      'create policy "family reads %1$s" on public.%1$I for select using (public.is_family())', t);

    execute format('drop policy if exists "family adds %1$s" on public.%1$I', t);
    execute format(
      'create policy "family adds %1$s" on public.%1$I for insert with check (public.is_family())', t);

    execute format('drop policy if exists "family edits %1$s" on public.%1$I', t);
    execute format(
      'create policy "family edits %1$s" on public.%1$I for update using (public.is_family()) with check (public.is_family())', t);
  end loop;
end $$;

-- A member may only file media under their own name. Public drop-off links
-- insert with a null uploader through the service role, which bypasses RLS.
drop policy if exists "family adds media" on public.media;
create policy "family adds media" on public.media
  for insert with check (public.is_family() and uploader_id = auth.uid());

-- Deleting a memory is the one destructive act — author or owner only.
drop policy if exists "author or owner deletes media" on public.media;
create policy "author or owner deletes media" on public.media
  for delete using (uploader_id = auth.uid() or public.is_owner());

drop policy if exists "owner deletes events" on public.events;
create policy "owner deletes events" on public.events
  for delete using (public.is_owner());

-- Tagging is collaborative, so removing a tag has to be possible. Without an
-- explicit DELETE policy these would silently delete nothing, and re-tagging
-- would then collide with the primary key.
do $$
declare
  t text;
begin
  foreach t in array array['people', 'media_people', 'music_tracks']
  loop
    execute format('drop policy if exists "family removes %1$s" on public.%1$I', t);
    execute format(
      'create policy "family removes %1$s" on public.%1$I for delete using (public.is_family())', t);
  end loop;
end $$;

-- reactions / comments / voice_notes ----------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['reactions', 'comments', 'voice_notes']
  loop
    execute format('drop policy if exists "family reads %1$s" on public.%1$I', t);
    execute format(
      'create policy "family reads %1$s" on public.%1$I for select using (public.is_family())', t);

    execute format('drop policy if exists "you add your own %1$s" on public.%1$I', t);
    execute format(
      'create policy "you add your own %1$s" on public.%1$I for insert with check (user_id = auth.uid())', t);

    execute format('drop policy if exists "you remove your own %1$s" on public.%1$I', t);
    execute format(
      'create policy "you remove your own %1$s" on public.%1$I for delete using (user_id = auth.uid() or public.is_owner())', t);
  end loop;
end $$;

-- event_upload_links (owner-only) -------------------------------------------
drop policy if exists "owner manages upload links" on public.event_upload_links;
create policy "owner manages upload links" on public.event_upload_links
  for all using (public.is_owner()) with check (public.is_owner());

-- ===========================================================================
-- Immutable columns
--
-- RLS can say "you may update this row"; it cannot say "but not that column".
-- Since the anon key and every member's JWT live in the browser, a relative
-- with devtools could otherwise run an UPDATE that RLS happily allows. These
-- two triggers put the columns that matter out of reach.
-- ===========================================================================

-- Without this, any family member can run
--   update profiles set role = 'owner' where id = <their own id>
-- which RLS permits (the row is theirs), and they now control the guest list.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_owner() then
    new.role := old.role;
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Two attacks this closes:
--   1. Rewriting uploader_id to yourself, which turns the "author may delete"
--      policy into "anyone may delete anything".
--   2. Rewriting r2_display_key to any object in the bucket — the app signs
--      whatever key the row holds, so that would be a bucket-wide read.
-- The storage pointers are written once, at insert, and never again.
create or replace function public.protect_media_fields()
returns trigger
language plpgsql
as $$
begin
  new.uploader_id    := old.uploader_id;
  new.uploader_label := old.uploader_label;
  new.upload_link_id := old.upload_link_id;
  new.type           := old.type;
  new.stream_uid     := old.stream_uid;
  new.r2_key         := old.r2_key;
  new.r2_display_key := old.r2_display_key;
  new.r2_thumb_key   := old.r2_thumb_key;
  return new;
end;
$$;

drop trigger if exists media_protect on public.media;
create trigger media_protect
  before update on public.media
  for each row execute function public.protect_media_fields();

-- Belt and braces for the role column, where Supabase's roles exist. Guarded so
-- the migration still applies on a plain Postgres.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke update (role) on public.profiles from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke update (role) on public.profiles from anon';
  end if;
end $$;

-- ===========================================================================
-- Invite-only enforcement + automatic profile creation
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.allowed_emails%rowtype;
begin
  select * into invite
    from public.allowed_emails
   where lower(email) = lower(new.email);

  if not found then
    raise exception 'This email has not been invited to %',
      coalesce(current_setting('app.name', true), 'this archive')
      using errcode = '42501';
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(btrim(invite.display_name), ''), split_part(new.email, '@', 1)),
    invite.role
  )
  on conflict (id) do nothing;

  update public.allowed_emails
     set claimed_at = now()
   where lower(email) = lower(new.email)
     and claimed_at is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Feed helpers
-- ===========================================================================

-- "4 years ago today" — every ready memory sharing today's month/day, but not
-- from this year.
create or replace function public.on_this_day(for_date date default current_date)
returns setof public.media
language sql
stable
as $$
  select *
    from public.media
   where status = 'ready'
     and taken_month = extract(month from for_date)::smallint
     and taken_day   = extract(day   from for_date)::smallint
     and taken_year <> extract(year  from for_date)::smallint
   order by taken_at desc;
$$;

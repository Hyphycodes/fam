-- ===========================================================================
-- Reel — community layer
--
-- Additive on top of 0001. Introduces a passcode-based community identity
-- (`members`) that is deliberately decoupled from Supabase Auth so the entry
-- gate can later be swapped for real auth without touching attribution.
--
-- The physical `events` table is kept (see 0003) and treated as the "collection"
-- domain object: events.kind distinguishes a community-board event from a quiet
-- album. Everything new attributes to members.id.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Members — the allowlist, the profile, and the community identity
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  -- Disambiguates two members who share a first name ("Alexis R." vs "Alexis M.").
  last_initial text,
  display_name text not null,
  -- What a person types to get in, made unique and immutable: "alexis.r".
  login_key    text generated always as (
    lower(first_name) ||
    case when last_initial is not null and length(btrim(last_initial)) > 0
         then '.' || lower(btrim(last_initial)) else '' end
  ) stored,
  avatar_path  text,
  role         text not null default 'member' check (role in ('owner','member')),
  -- Optional bridge to a legacy magic-link identity, if the same person has one.
  profile_id   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index if not exists members_login_key_idx on public.members(login_key);

comment on table public.members is
  'Community identity + allowlist. Decoupled from auth.users; entry is first name + shared passcode.';

-- ---------------------------------------------------------------------------
-- 2. Member sessions — persistent and multi-device
--
-- The gate stores sha256(token); the raw token lives only in an httpOnly cookie.
-- Looking a session up by hash means a leaked DB row can't be replayed as a login.
-- ---------------------------------------------------------------------------
create table if not exists public.member_sessions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  token_hash   text not null unique,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz
);
create index if not exists member_sessions_member_idx on public.member_sessions(member_id);

-- ---------------------------------------------------------------------------
-- 3. Collections — an album and a community event are the same object
--    (physical table stays `events`; see 0003 for why)
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists kind text not null default 'event' check (kind in ('album','event')),
  add column if not exists description text,
  add column if not exists created_by_member uuid references public.members(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. Attribution — a member_id alongside the legacy profile references.
--    New writes set member_id; the hydrate layer prefers it, falling back to
--    the profile for anything created before the community layer.
-- ---------------------------------------------------------------------------
alter table public.media     add column if not exists uploader_member uuid references public.members(id) on delete set null;
alter table public.reactions add column if not exists member_id uuid references public.members(id) on delete cascade;
alter table public.comments  add column if not exists member_id uuid references public.members(id) on delete cascade;

-- Reactions and comments become polymorphic: the subject is a media item OR a
-- collection (event). Exactly one, always with an author from either identity.
alter table public.reactions alter column user_id  drop not null;
alter table public.comments  alter column user_id  drop not null;
alter table public.reactions alter column media_id drop not null;
alter table public.comments  alter column media_id drop not null;
alter table public.reactions add column if not exists collection_id uuid references public.events(id) on delete cascade;
alter table public.comments  add column if not exists collection_id uuid references public.events(id) on delete cascade;

alter table public.reactions drop constraint if exists reactions_one_subject;
alter table public.reactions add constraint reactions_one_subject
  check ((media_id is not null)::int + (collection_id is not null)::int = 1);
alter table public.comments  drop constraint if exists comments_one_subject;
alter table public.comments  add constraint comments_one_subject
  check ((media_id is not null)::int + (collection_id is not null)::int = 1);

alter table public.reactions drop constraint if exists reactions_has_author;
alter table public.reactions add constraint reactions_has_author
  check (user_id is not null or member_id is not null);
alter table public.comments  drop constraint if exists comments_has_author;
alter table public.comments  add constraint comments_has_author
  check (user_id is not null or member_id is not null);

-- One reaction of a given emoji per member per subject.
create unique index if not exists reactions_media_member_idx
  on public.reactions(media_id, member_id, emoji)      where member_id is not null and media_id is not null;
create unique index if not exists reactions_coll_member_idx
  on public.reactions(collection_id, member_id, emoji) where member_id is not null and collection_id is not null;
create index if not exists reactions_collection_idx on public.reactions(collection_id);
create index if not exists comments_collection_idx  on public.comments(collection_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. Tags — a tagged person can be a member or a free-text name; optionally a
--    point on the image, and a record of who added the tag.
-- ---------------------------------------------------------------------------
alter table public.people       add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.media_people add column if not exists tagged_by uuid references public.members(id) on delete set null;
alter table public.media_people add column if not exists x real check (x is null or (x >= 0 and x <= 1));
alter table public.media_people add column if not exists y real check (y is null or (y >= 0 and y <= 1));

-- ---------------------------------------------------------------------------
-- 6. RLS — the new identity tables are service-role only. A passcode session
--    has no auth.uid(), so every read/write goes through a server route that
--    has already validated the member. Enabling RLS with no policy means the
--    anon and authenticated roles see nothing, which is exactly right.
-- ---------------------------------------------------------------------------
alter table public.members         enable row level security;
alter table public.member_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Avatars bucket. Public within an already-private app, with unguessable
--    per-member paths — no signing round-trip on every avatar on a phone.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('avatars','avatars',true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Seed the allowlist. Two "Alexis" members are added separately once their
--    last initials are known (login_key must stay unique).
-- ---------------------------------------------------------------------------
insert into public.members (first_name, display_name) values
  ('Manny','Manny'),('Jessica','Jessica'),('Chin','Chin'),('Kamila','Kamila'),
  ('Nick','Nick'),('Jandis','Jandis'),('Ali','Ali'),('Natalie','Natalie'),
  ('George','George'),('Danny','Danny'),('Claudia','Claudia'),('Sergio','Sergio'),
  ('Pablo','Pablo'),('RJ','RJ'),('Jayleen','Jayleen'),('Isaiah','Isaiah'),
  ('Christopher','Christopher'),('Isabel','Isabel'),('C3','C3'),('Magaly','Magaly'),
  ('Pedro','Pedro'),('Monica','Monica'),('Ricardo','Ricardo'),('Niko','Niko'),
  ('Matteo','Matteo')
on conflict do nothing;

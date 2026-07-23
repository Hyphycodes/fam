-- Make person tags identity-first. Two relatives may share a display name, so a
-- name alone cannot be the permanent relationship between tags and accounts.

alter table public.people
  drop constraint if exists people_name_key;

create index if not exists people_name_lookup_idx
  on public.people (lower(name));

create index if not exists people_member_identity_idx
  on public.people (member_id)
  where member_id is not null;

create index if not exists people_profile_identity_idx
  on public.people (profile_id)
  where profile_id is not null;

-- Backfill only unambiguous names. Ambiguous rows remain tag-only instead of
-- silently attributing uploads to the wrong relative.
with unique_members as (
  select lower(display_name) as normalized_name, min(id::text)::uuid as id
  from public.members
  group by lower(display_name)
  having count(*) = 1
)
update public.people as person
set member_id = member.id
from unique_members as member
where person.member_id is null
  and lower(person.name) = member.normalized_name
  and not exists (
    select 1
    from public.people as linked
    where linked.member_id = member.id
  );

with unique_profiles as (
  select lower(display_name) as normalized_name, min(id::text)::uuid as id
  from public.profiles
  group by lower(display_name)
  having count(*) = 1
)
update public.people as person
set profile_id = profile.id
from unique_profiles as profile
where person.profile_id is null
  and lower(person.name) = profile.normalized_name
  and not exists (
    select 1
    from public.people as linked
    where linked.profile_id = profile.id
  );

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 8;
$$;

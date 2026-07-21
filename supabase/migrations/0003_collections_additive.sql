-- ===========================================================================
-- Keep the community layer strictly additive.
--
-- 0002 (as originally drafted) renamed `events` -> `collections` and
-- `media.event_id` -> `media.collection_id`. That is the cleaner domain name,
-- but it breaks every existing query the moment it is applied and before new
-- code ships. Since "additive, don't break existing routes" is the governing
-- guardrail, this migration keeps the physical table named `events` and the
-- column named `event_id`. The "collection" stays a domain concept in the
-- TypeScript layer (events.kind = 'album' | 'event'); nothing in the existing
-- app has to change.
--
-- The 0002 file in this repo already reflects the additive form, so on a fresh
-- database this migration is a harmless no-op guarded by `if exists`.
-- ===========================================================================

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'collections') then
    execute 'alter table public.collections rename to events';
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media'
               and column_name = 'collection_id') then
    execute 'alter table public.media rename column collection_id to event_id';
  end if;
end $$;

comment on table public.events is
  'A collection. kind=event shows on the community board (flyer=cover_media_id, date, description); kind=album is a quiet grouping. Physical name kept as events so existing code is untouched.';

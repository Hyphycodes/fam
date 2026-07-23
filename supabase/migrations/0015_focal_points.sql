-- ===========================================================================
-- Reel — focal points
--
-- A cover crop has to choose what to keep. Center-crop is a coin flip in a
-- family archive: the subject is a face, and faces sit high in the frame, so a
-- 16:9 crop of a 4:3 photo routinely lands on a torso. These columns record
-- where the subject actually is, so every cropped cover can drive
-- `object-position` from it instead of guessing center.
--
--   focal_x / focal_y  — 0..1, the point to keep in view (default dead-center).
--   focal_source       — how we know: 'default' (center, unknown),
--                        'face' (centroid of detected faces, set on ingest),
--                        'user' (a person placed it — sacred, never overwritten).
--
-- Additive only, and orthogonal to crop_metadata: crop rewrites the stored
-- derivative; focal only steers how an already-stored image is framed inside a
-- box. A wrong focal point is a slightly-off crop, never a broken image — so the
-- backfill can be lazy and the default is always safe.
-- ===========================================================================

alter table public.media
  add column if not exists focal_x real not null default 0.5
    check (focal_x >= 0 and focal_x <= 1),
  add column if not exists focal_y real not null default 0.5
    check (focal_y >= 0 and focal_y <= 1),
  add column if not exists focal_source text not null default 'default'
    check (focal_source in ('default', 'face', 'user'));

comment on column public.media.focal_x is
  'Horizontal focal point 0..1 for object-position when a cover crops this image.';
comment on column public.media.focal_y is
  'Vertical focal point 0..1 for object-position when a cover crops this image.';
comment on column public.media.focal_source is
  'Where the focal point came from: default (center) | face (detected on ingest) | user (placed by a person — never overwritten).';

-- Backfill. `add column ... default` already set every existing row to safe
-- center defaults; the guarded updates below only ever fill NULLs and never
-- touch a row a person has corrected (source='user'). Face detection runs at
-- ingest, where the decoded bitmap already lives; existing media stays centered
-- until it is next processed. Re-running this block is a no-op — a wrong crop is
-- not an outage, and a user's placement is sacred.
update public.media set focal_x = 0.5 where focal_x is null;
update public.media set focal_y = 0.5 where focal_y is null;
update public.media
   set focal_source = 'default'
 where focal_source is null
   and focal_source is distinct from 'user';

create or replace function public.reel_schema_version()
returns integer
language sql
stable
as $$
  select 15;
$$;

-- ===========================================================================
-- DOWN MIGRATION (manual — not auto-applied)
--
--   alter table public.media
--     drop column if exists focal_source,
--     drop column if exists focal_y,
--     drop column if exists focal_x;
--   create or replace function public.reel_schema_version()
--   returns integer language sql stable as $$ select 14; $$;
--
-- Lossless for the archive: focal only steers framing; the images are untouched.
-- ===========================================================================

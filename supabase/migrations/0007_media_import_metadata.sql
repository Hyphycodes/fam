-- Batch-import metadata. Additive only: existing rows and storage keys remain valid.

alter table public.media
  add column if not exists content_hash text,
  add column if not exists location_text text,
  add column if not exists crop_metadata jsonb;

-- One original file should produce one media row. Failed imports reuse the same
-- row and storage keys when retried instead of inserting a second record.
create unique index if not exists media_content_hash_unique_idx
  on public.media (content_hash)
  where content_hash is not null;

create index if not exists media_uploader_member_idx
  on public.media (uploader_member, created_at desc)
  where uploader_member is not null;

create index if not exists people_member_idx
  on public.people (member_id)
  where member_id is not null;

comment on column public.media.content_hash is
  'SHA-256 of the untouched original, used to resume imports and prevent duplicate media rows.';
comment on column public.media.location_text is
  'Optional human-readable location supplied during import or metadata editing.';
comment on column public.media.crop_metadata is
  'Non-destructive crop instructions for display derivatives. The R2 original remains untouched.';

-- Keep new identity/dedupe fields under the same write-once protection as the
-- original storage pointers. Crop and descriptive metadata remain editable.
create or replace function public.protect_media_fields()
returns trigger
language plpgsql
as $$
begin
  new.uploader_id    := old.uploader_id;
  new.uploader_member := old.uploader_member;
  new.uploader_label := old.uploader_label;
  new.upload_link_id := old.upload_link_id;
  new.type           := old.type;
  new.stream_uid     := old.stream_uid;
  new.r2_key         := old.r2_key;
  new.r2_display_key := old.r2_display_key;
  new.r2_thumb_key   := old.r2_thumb_key;
  new.content_hash   := old.content_hash;
  return new;
end;
$$;

-- Community-board events carry a flyer image. Stored in its own public bucket
-- (unguessable paths), separate from the R2/Stream media pipeline so posting an
-- event stays a single lightweight step.
alter table public.events add column if not exists flyer_path text;

insert into storage.buckets (id, name, public) values ('flyers','flyers',true)
on conflict (id) do nothing;

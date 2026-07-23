# FAM / Reel — Architecture Map

> Produced by Prompt 01 (Recon). This is a map of the codebase **as it exists
> today**, so every later sprint prompt can be written against real names
> instead of guesses. No code was changed to produce it.
>
> Product name is **FAM**; the package/codebase is named `reel` and the app
> title env is `Reel`. Both names appear throughout — they refer to the same
> thing.

## Stack at a glance

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript, `strict`, path alias `@/*` → repo root |
| Metadata DB | Supabase Postgres (accessed via `@supabase/supabase-js`) |
| Photo/original storage | Cloudflare R2 (via `@aws-sdk/client-s3`, presigned URLs) |
| Video storage/playback | Cloudflare Stream (tus resumable upload, HLS/iframe playback) |
| Auth | Two systems: passcode **members** (primary) + legacy magic-link **profiles** |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), design tokens in `app/globals.css` |
| Hosting | Vercel (`vercel.json`, `next` framework) |
| Tests | `node --test` (`tests/*.test.ts`) + PGlite schema check (`npm run check:sql`) |

Scripts (`package.json`): `dev`, `build`, `start`, `lint` (eslint), `typecheck`
(`tsc --noEmit`), `test` (node test runner), `check:sql` (PGlite migration
harness), plus operational scripts (`stream:signing-key`, `r2:cors`, `make-icons`).

---

## 1. Routes

All 15 `page.tsx` are **React Server Components** (`async`, no `'use client'`);
14 set `export const dynamic = 'force-dynamic'` (only `app/offline/page.tsx` is
static). There is **no `middleware.ts`** — each page/route gates itself by
calling `requireViewer()` / `getViewer()` / `getSession()` / `getActor()`.
`requireViewer()` (`lib/viewer.ts:45`) redirects to `/enter`; pages redirect to
`/setup` when `isConfigured('supabase')` is false.

### Pages

| Path | File | Renders | Fetches |
|---|---|---|---|
| `/` (Home) | `app/page.tsx` | `Shell` + local `Billboard`, `AlbumCard` rail, `ShuffleCard`, `CollectionCard` grid, `FirstTime` | `getFeed`, `getOnThisDay`, `getEvents`, `getBrowseCovers`; `reconcileProcessingVideos()` |
| `/browse` | `app/browse/page.tsx` | `Shell` + `Rail`/`MediaTile`/`CoverTile` sections (Recent, People, Albums&events, Years, Favorites) | `getFeed`, `getPeople`, `getEvents`, `getYears`, `getBrowseCovers` |
| `/albums` | `app/albums/page.tsx` | `Shell` + `AlbumOrganizer` | `getEvents`, `getFeed({unfiled})`, `getBrowseCovers` |
| `/collection/[kind]/[id]` (`kind`=`event`\|`person`\|`year`) | `app/collection/[kind]/[id]/page.tsx` | `Shell` + `Feed` or `Rail`/`MediaTile` | event/person lookup + `getFeed` filtered by event/person/year |
| `/community` (**Board**) | `app/community/page.tsx` | `Shell` + `CreateEvent`, `EventCard` grid split "Coming up" / "Already happened" | `getBoardEvents(readDb())` |
| `/community/[id]` | `app/community/[id]/page.tsx` | `Shell` + flyer, `Reactions`, `Comments`, `Feed`, `AddMemoriesButton` | `getCollectionById`, `getFeed({eventId})` |
| `/m/[id]` (memory detail) | `app/m/[id]/page.tsx` | `Shell` + media, `Reactions`, `VoiceNotes`(legacy), `Comments`, `MemoryEditor`, `DownloadButton`, `ProcessingWatcher` | `getMediaById`, `getEvents`; `reconcileProcessingVideos()` |
| `/movie` (Movie Mode) | `app/movie/page.tsx` | `<MovieMode>` full-screen, **no `Shell`** | `getFeed({limit:400, order:'taken'})`, `getPeople`, `getEvents`, `getYears` → `Flavor[]` |
| `/you` | `app/you/page.tsx` | `Shell` + `ProfileEditor`, `Rail` of own uploads, sign-out, owner `/settings` link | `getFeed({uploaderMemberId/uploaderId})` |
| `/settings` | `app/settings/page.tsx` | `Shell` + `FamilyManager` (invites/links/events/music), `StorageHealth` | `getEvents`, `getMusicTracks`; owner-only `getInvites`, `getUploadLinks` |
| `/setup` | `app/setup/page.tsx` | Config checklist (not viewer-gated) | `setupStatus()` (env only) |
| `/enter` | `app/enter/page.tsx` | `NameEntry` (first name + passcode) | `listMemberNames()` |
| `/login` | `app/login/page.tsx` | `LoginForm` (magic link) | `getSession()` |
| `/offline` | `app/offline/page.tsx` | Static offline fallback | none |
| `/add/[token]` | `app/add/[token]/page.tsx` | `PublicDropOff` or `Closed` | `event_upload_links` + `events` by token |

### Route handlers (`route.ts`)

`app/api/**`: `auth/magic-link`, `auth/signout`, `auth/callback`; `feed`,
`movie`, `music`, `events`, `albums/assign`; `community/{enter,events,profile,
avatar,flyer,leave,tag-suggestions}`; `upload/{photo,video}`, `upload-links`,
`invites`; `media/[id]` (GET/PATCH/DELETE) + `media/[id]/{voice,crop,ready,
status,reactions,comments}`; `collections/[id]/{reactions,comments}`;
`debug/{r2,readiness}`. All confirmed present.

### Nav-reachability

- **Reachable from the dock/chrome:** `/`, `/browse`, `/community`, `/you`
  (dock); wordmark→`/` and avatar→`/you` (Shell header).
- **In-page links only (no dock entry):** `/albums`, **`/movie`**,
  `/collection/[kind]/[id]`, `/m/[id]`, `/community/[id]`, `/settings` (owner).
- **Orphaned / redirect- or token-only:** `/setup`, `/enter`, `/login`,
  `/offline`, `/add/[token]`, `/auth/callback`.

> Note for the sprint: **Movie Mode has no nav entry** — it's reached only from
> two Home links. **`/albums` also has no dock entry** (Browse highlights for it
> via `activePrefixes`). Both are relevant to the Timeline/Home reshuffles.

---

## 2. Data model

Migrations live in `supabase/migrations/000N_*.sql`, applied in filename order.
They are **hand-run** (Supabase SQL editor or `supabase db push`) — nothing in
the Vercel build applies them. `public.reel_schema_version()` currently returns
**8** (`0008`). `npm run check:sql` runs every migration against PGlite and
asserts behaviour, including that version.

### `media` — the heart

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | minted app-side at insert (so storage keys are write-once) |
| `uploader_id` | uuid→profiles | yes | legacy identity |
| `uploader_member` | uuid→members | yes | passcode identity (0002) |
| `uploader_label` | text | yes | for public drop-off uploads |
| `type` | text | no | `'photo'` \| `'video'` |
| `stream_uid` | text unique | yes | Cloudflare Stream id (video) |
| `duration_seconds` | numeric | yes | |
| `r2_key` | text | yes | untouched original |
| `r2_display_key` | text | yes | web derivative |
| `r2_thumb_key` | text | yes | grid thumb |
| `poster_url` | text | yes | override; **never written on upload** (see Landmines) |
| `mime_type`, `original_filename`, `byte_size`, `width`, `height` | | yes | |
| `caption` | text | yes | editable |
| `favorite` | boolean | no | default false |
| `tags` | text[] | no | default `{}` (largely vestigial; people-tagging uses `media_people`) |
| **`taken_at`** | **timestamptz** | **no** | **default `now()` — the canonical capture timestamp** |
| `event_id` | uuid→events | yes | album/event membership (FK, not a join table) |
| `upload_link_id` | uuid→event_upload_links | yes | |
| `status` | text | no | `'processing'`\|`'ready'`\|`'error'` |
| `error_reason` | text | yes | |
| `created_at` | timestamptz | no | upload time |
| `taken_month`/`taken_day`/`taken_year` | smallint | no | **generated** from `taken_at at time zone 'UTC'` |
| `content_hash` | text | yes | SHA-256 of original; unique partial index (dedupe) (0007) |
| `location_text` | text | yes | freeform location (0007) |
| `crop_metadata` | jsonb | yes | non-destructive crop instructions (0007) |

Indexes on `created_at desc`, `taken_at desc`, `event_id`, `uploader_id`,
`uploader_member`, `status` (partial), `(taken_month, taken_day)`, `taken_year`,
`favorite` (partial), `content_hash` (unique partial). Constraint
`media_has_a_home` (`stream_uid is not null or r2_key is not null`).

**Date/time columns & who writes them:** only `taken_at` (+ generated
month/day/year) and `created_at`. `taken_at` is written at upload insert
(`app/api/upload/{photo,video}/route.ts`, `parseDate(body.takenAt) ?? new Date()`),
by the best-effort details PATCH, and by later manual edits
(`app/api/media/[id]/route.ts` PATCH → `changes.taken_at`). **There is no
precision/source concept today** — a guessed date and a real EXIF date are
indistinguishable in the schema. That gap is exactly what Prompt 02 fills.

### `events` — albums **and** board events are one table

`0002`/`0003` deliberately kept the physical table named `events` (renaming
broke every query). An `events` row is a "collection":

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | |
| `name` | text | no | |
| `event_date` | **date** | yes | day-granular; distinct from media `taken_at` |
| `cover_media_id` | uuid→media | yes | |
| `created_by` | uuid→profiles | yes | legacy host |
| `created_by_member` | uuid→members | yes | passcode host (0002) |
| `kind` | text | no | **`'album'` \| `'event'`** (0002) — album = quiet grouping, event = board |
| `description` | text | yes | (0002) |
| `flyer_path` | text | yes | flyer in public `flyers` bucket (0004) |
| `created_at` | timestamptz | no | |

**There is no event lifecycle/status column yet** — every event is implicitly
"happened." Prompt 04 adds `status` + `starts_at`/`ends_at`.

### Identity

- **`members`** (0002) — passcode identity, the primary one. `login_key`
  (generated from `first_name`+`last_initial`), `role` (`'owner'`\|`'member'`),
  `avatar_path`, optional `profile_id` bridge. `member_sessions` stores
  `sha256(token)`.
- **`profiles`** (0001) — legacy magic-link accounts keyed to `auth.users`,
  `role` (`'owner'`\|`'family'`). Gated by `allowed_emails` allowlist + a
  signup trigger.

### Human layer

- `reactions`, `comments` — **polymorphic**: subject is `media_id` **or**
  `collection_id` (exactly one, `*_one_subject` check); author is `user_id`
  **or** `member_id` (`*_has_author` check). This is why board events already
  support comments/reactions and Prompt 04 can reuse them for planned events
  with no new tables.
- `voice_notes` — on media, legacy-only in UI.
- `people` + `media_people` — people tagging. `media_people` is the join
  (composite PK `(media_id, person_id)`), with optional `x`/`y` face point and
  `tagged_by`. `people` can link to a `member_id` and/or `profile_id` (0008).
- `event_upload_links` — tokened public drop-off links.
- `music_tracks` — Movie Mode soundtrack (R2-backed).

### Access model

Everything family-facing runs through the **service-role admin client**
(`lib/supabase/admin.ts`) after a viewer check — because a passcode member has
no `auth.uid()` for RLS to key on (`lib/db.ts` explains this). RLS policies
exist and are correct for the legacy path (`is_family()`/`is_owner()`), and the
`members`/`member_sessions` tables are RLS-enabled with **no policy** (service-role
only). Column-immutability triggers (`protect_media_fields`,
`protect_profile_fields`) freeze storage pointers, identity, `content_hash`,
and role — RLS can't restrict columns and the anon key ships to the browser.

> **`protect_media_fields` does NOT freeze `taken_at`, `location_text`,
> `caption`, `favorite`, `event_id`** — so Prompt 02's date/precision edits and
> Prompt 04's event edits are allowed by the trigger. Do not add the new
> temporal columns to that trigger (users must be able to edit them).

---

## 3. Media pipeline

### Photo (end to end)

1. **Pick/review** — `components/AddMemories.tsx` opens the OS picker; files go
   to `components/UploadDetailsSheet.tsx` (classify, HEIC preview, shared batch
   details incl. an optional **Date**).
2. **Hash** — SHA-256 per file (`hash-wasm`), assembled into `UploadDetails`
   (incl. `takenAt`), queued in `AddMemories` (`UploadQueue` singleton).
3. **Client prep** — `lib/client/uploader.ts` `uploadPhoto()` →
   `lib/client/media-prep.ts` `preparePhoto()`: decode (native
   `createImageBitmap`, HEIC via `heic2any` fallback), encode **display**
   (≤2560, q0.86) and **thumb** (≤640, q0.72) as WebP/JPEG, and read
   `exifTakenAt(file)`.
4. **Server: mint row + presign** — `POST app/api/upload/photo/route.ts`:
   validate, `resolveUploader`, dedupe by `content_hash`, `randomUUID()`,
   `buildKey()` ×3, **insert `media` row (`status:'processing'`, `taken_at`)**,
   presign 3 R2 PUTs.
5. **Client PUTs** to R2 directly (`putPhotoPart`, exact signed `Content-Type`).
   The **original is uploaded untouched** (HEIC stays HEIC); only display/thumb
   are transcoded.
6. **Apply details (best-effort)** — `applyDetails()` PATCHes `/api/media/[id]`
   with caption/people/event/**takenAt**/location. Failure does **not** fail the
   upload (soft "Retry details").
7. **Mark ready** — `POST /api/media/[id]/ready` sets `status:'ready'`.
8. **Render** — `lib/queries.ts hydrate()` presigns GET URLs (12h) for
   display/thumb/original → `MediaView`.

### Video (end to end)

`POST app/api/upload/video/route.ts` mints a Cloudflare Stream **direct (tus)**
upload + inserts the `media` row (`stream_uid`, `status:'processing'`,
`taken_at`); `lib/client/uploader.ts` uploads bytes straight to Cloudflare
(`tus-js-client`); client polls `GET /api/media/[id]/status` (writes back
`ready`/`error` + duration/dimensions from `getVideo`); `lib/reconcile.ts`
`reconcileProcessingVideos()` (runs on every media-reading page) is the
tab-closed safety net. Playback via `lib/stream.ts playbackUrls()` (HLS +
iframe + poster, optional signed JWT) rendered through `components/VideoFrame.tsx`.

### Where it can fail silently

EXIF read (JPEG-only, blanket `catch`); best-effort details PATCH (a dropped
`taken_at`/tags surfaces only as a soft chip); R2 `forcePathStyle` (self-doc'd
silent); video poll timeout (left `processing`, not errored); reconcile
`allSettled`; `getOnThisDay`/`getNewThisWeek` return `[]` on error; best-effort
Stream/R2 cleanup orphans objects; `poster_url` never written on upload.

### R2 presigned-URL path — every file (fragile; do not disturb)

`lib/r2.ts` (`s3()` with `forcePathStyle:true`, `buildKey`, `presignPut`,
`presignGet`, `presignMany`, `deleteObjects`, `checkR2Health`), `lib/env.ts`
(`isConfigured('r2')`/`missing('r2')`), `app/api/upload/photo/route.ts` (PUTs),
`lib/client/uploader.ts` (`putPhotoPart`), `app/api/media/[id]/ready/route.ts`,
`lib/queries.ts` (`hydrate` GETs), plus GET consumers `lib/community/events.ts`,
`app/api/music/route.ts`, `app/api/media/[id]/voice/route.ts`,
`app/api/media/[id]/route.ts` (DELETE), and `app/api/debug/r2/route.ts`.
**Prompt 02 must read EXIF client-side before the PUT or after the object lands
— it must not alter this presign flow.**

---

## 4. Component inventory (`components/`, 33 files)

Reusable pieces (client unless noted):

- **Chrome/nav:** `Shell.tsx` (server; header + `<main>` + `Nav`), `Nav.tsx`
  (bottom dock), `Avatar.tsx` (server), `PeopleStack.tsx` (server).
- **Grids/rails/cards:** `Rail.tsx` (`Rail` + `MediaTile`/`PosterTile`/
  `CoverTile`, server), `Feed.tsx` (infinite editorial column → `Lightbox`),
  `Shelf.tsx` (**unused**), `ActivityStrip.tsx` (**unused**).
- **Viewers/players:** `Lightbox.tsx`, `MovieMode.tsx`, `VideoFrame.tsx`.
- **Upload:** `AddMemories.tsx` (button + tray + `UploadQueue`),
  `UploadDetailsSheet.tsx` (review sheet), `PhotoCropEditor.tsx`,
  `PhotoRecropButton.tsx`.
- **Edit/compose:** `MemoryEditor.tsx` (detail-page edit disclosure — **already
  has Date + Location fields**), `EventPicker.tsx`, `PersonTagPicker.tsx`
  (exports `TagChip`), `CreateEvent.tsx`, `Comments.tsx`, `Reactions.tsx`,
  `VoiceNotes.tsx`, `AlbumOrganizer.tsx`.
- **Account/owner:** `ProfileEditor.tsx`, `FamilyManager.tsx`
  (`InviteManager`/`UploadLinkManager`/`EventManager`/`MusicManager`),
  `StorageHealth.tsx`, `LoginForm.tsx`, `NameEntry.tsx`, `PublicDropOff.tsx`.
- **Misc:** `ArchiveState.tsx` (server), `ProcessingWatcher.tsx` (null),
  `ServiceWorker.tsx` (null), `DownloadButton.tsx`.

**Near-duplicates / consolidation candidates:** `Rail.MediaTile` vs unused
`Shelf`; two bespoke multi-select grids (`AlbumOrganizer` `selected:string[]`
vs `UploadDetailsSheet` per-item boolean) with **no shared selectable-grid
primitive**; three hand-rolled modals (`Lightbox`, `UploadDetailsSheet`,
`PhotoCropEditor` each re-implement scroll-lock + focus-trap + Escape — **no
`Sheet`/`Dialog` primitive**); "create album/event" form repeated 4×; album
cover cards 3×.

**Selection today:** only `AlbumOrganizer` (grid multi-select → `POST
/api/albums/assign` with `{albumId, mediaIds}`, the model for any bulk action)
and `UploadDetailsSheet` (batch include/exclude). Browse/Feed/Rail/person/year
pages have **no selection** — Prompt 02's bulk date editor must add one (learn
from `AlbumOrganizer`).

---

## 5. Existing Movie Mode (Prompt 07 rewrites its boundaries)

- **UI:** `components/MovieMode.tsx` (`'use client'`, exports `MovieMode` +
  `Flavor`). Subcomponents `StartScreen`, `Frame`, `Controls`, `ControlButton`.
- **Route:** `app/movie/page.tsx` (server loader) → `<MovieMode flavors
  initialMedia />`, no `Shell`.
- **Data API:** `app/api/movie/route.ts` GET.
- **Helpers:** `lib/client/reel.ts` (`buildReel`, `kenBurns`, `Segment`),
  `lib/client/music.ts` (`MusicBed`, `MUSIC_LEVEL`).
- **Input:** props `flavors: Flavor[]`, `initialMedia: MediaView[]`. `Flavor =
  { kind: 'everything'|'person'|'event'|'year'|'funny'; id?; year?; label }`.
  Choosing a flavor refetches `/api/movie?person=|event=|year=|flavor=funny`.
- **`/api/movie`** returns `{ media }` from `getFeed(db, {limit:400,
  order:'taken', eventId, personId, year, favorite})`. **"Funny stuff" is
  literally `favorite:true`** (not real sentiment) — a known naming smell.
- **State:** all `useState` — `flavor`, `media`, `quiet`, `started`, `playing`,
  `index`, `previous`, `showControls`, `tracks`, `trackIndex`, `loading`,
  `music` (lazy). Derived `reel` via `useMemo(buildReel(...))`.
- **Entry:** two Home links only (Billboard button + "Movies" `CollectionCard`).
  No deep-link into a specific flavor.

> Movie Mode already **is** the single player the sprint plan wants to unify
> around; its source is already a parameter (`getFeed` options). Prompt 07's job
> is boundaries/entry points, not a rewrite of playback.

---

## 6. Nav and Board

**Nav** (`components/Nav.tsx`, rendered by `Shell.tsx`) — five dock slots:

```
Home(/)   Browse(/browse)   (+ AddMemories)   Board(/community)   You(/you)
```

`NavLink` computes active via `usePathname()` (`/` exact; else
`activePrefixes.some(startsWith)`). Browse's `activePrefixes` =
`['/browse','/albums','/collection']`. Icons are inline SVGs in `DockGlyph`
(`DockIcon = 'home'|'browse'|'board'|'you'`). The center slot is
`AddMemoriesButton` (an action, not a link).

> Prompt 03: **Browse → Timeline** means editing this file (label, `href`,
> `DockIcon`, `activePrefixes`) and adding a `/browse` → `/timeline` redirect.
> Prompt 04: **Board (`/community`)** becomes the planning surface.

**Board** is **real, not a placeholder.** `/community`
(`app/community/page.tsx`) renders `getBoardEvents(readDb())`
(`lib/community/events.ts`: `events WHERE kind='event'`, with cover/host/counts),
splitting on `event_date` into "Coming up" vs "Already happened", plus
`CreateEvent`. `/community/[id]` (`getCollectionById`) shows flyer + polymorphic
`Reactions`/`Comments` + the event's `Feed`. New board events post via `POST
/api/community/events` (admin insert, `kind='event'`, flyer).

**Browse** is **real, not a placeholder** — the archive-browsing hub (Recent,
People, Albums&events, Years, Favorites rails). Its discovery/search role is
what Prompt 03 folds into Timeline.

---

## 7. Conventions

- **Naming:** `snake_case` in Postgres and on row objects (`taken_at`,
  `event_id`); `camelCase` in TS/React and in API request bodies
  (`takenAt`, `eventId`). API handlers translate at the boundary
  (`app/api/media/[id]/route.ts`: `body.takenAt` → `changes.taken_at`).
- **Data fetching:** server components fetch via `readDb()` (service-role) and
  the `lib/queries.ts` / `lib/community/*` helpers, passing plain data to client
  components as props. Client mutations go through `app/api/**` route handlers
  (`fetch` + JSON), which use `getActor()`/`resolveUploader()` for identity.
- **Read shape:** queries mostly `select('*')` then stitch relations in JS via
  a few `.in()` round trips (`hydrate()`), rather than PostgREST embeds. `MediaRow`
  → `MediaView` (signed URLs + names + counts) is the hydration boundary.
- **Propagation / cache invalidation:** there is **no `revalidatePath` /
  `revalidateTag`** anywhere. Pages are `force-dynamic` + service-role (no
  caching), and client components call **`router.refresh()`** after a successful
  mutation to re-run the server component. **Reuse `router.refresh()`** — do not
  introduce a second invalidation mechanism (Prompt 02 §6).
- **Formatting:** shared date/text helpers in `lib/format.ts` (`warmDate`,
  `osdDate`, `fullDate`, `season`, `fileSize`, `duration`, `nameList`, …).
  Components mostly import these, but **some format `taken_at` inline** (e.g.
  `app/m/[id]/page.tsx` uses `fullDate(media.taken_at)` directly; `MovieMode`
  uses `fullDate`). Prompt 02's `formatCapturedAt(date, precision)` belongs
  here.
- **Errors/loading:** `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx`
  at the root. API routes use `lib/api.ts` `ok()`/`fail()`/`handleError()`/
  `logDbError()`; user-facing error strings are full sentences.
- **Migrations:** additive numbered SQL files in `supabase/migrations/`, applied
  by hand; idempotent (guarded with `if not exists` / `if exists`); verified by
  `npm run check:sql` (PGlite) which also asserts `reel_schema_version()`.

---

## 8. Landmines (known-fragile; **left as-is per Prompt 01**)

1. **EXIF is JPEG-only and client-only** (`lib/client/media-prep.ts:186`
   `exifTakenAt`). HEIC (the default iPhone format), PNG/WebP/TIFF, and **all
   videos** skip EXIF and fall back to `file.lastModified` — the copy date, not
   the capture date. This directly undercuts the "N years ago today" promise and
   is the single most important thing Prompt 02 should be aware of (many
   existing rows have a `taken_at` that is really an upload/copy date → they
   should backfill to a low-confidence source).
2. **Best-effort details PATCH** (`lib/client/uploader.ts applyDetails`) — a
   user-set date/tags can silently fail to apply and the item still goes
   `ready`.
3. **R2 `forcePathStyle` fails silently** (`lib/r2.ts:54-61`, self-documented);
   `Content-Type` is part of the PUT signature (403 on mismatch). Treat the
   whole presign path (§3) as fragile.
4. **`poster_url` is never written on upload** — column exists, is dead on the
   write path; posters always come from Stream's generated thumbnail.
5. **Video poll timeout leaves rows `processing`** (not `error`) after ~45 min.
6. **Swallowed errors** return empty/degraded UI in `getOnThisDay`/
   `getNewThisWeek`, reconcile (`allSettled`), health-check `ListBucket`, and
   best-effort Stream/R2 deletes (orphaned objects).
7. **Dead code:** `components/Shelf.tsx`, `components/ActivityStrip.tsx`, and
   `Rail.PosterTile` are never imported/used.
8. **"Funny stuff" == favorites** in Movie Mode (`app/api/movie/route.ts`) — a
   label that doesn't mean what it says.
9. **No shared modal/selectable-grid primitive** — three modals and two
   selection grids are each hand-rolled (§4), so new sheets/selection UIs have
   nothing to build on.

---

## Appendix — Naming map for the sprint prompts

The prompts use idealized names; here are the repo's real ones to adapt to.

| Prompt term | Repo reality |
|---|---|
| `captured_at` (canonical sort key) | **`media.taken_at`** already exists (timestamptz NOT NULL, indexed, drives generated `taken_month/day/year`). Reuse it — do not add a parallel column. |
| `captured_precision` / `captured_source` | **New** columns (Prompt 02). Adapt to `taken_*` naming for consistency (`taken_precision`, `taken_source`). |
| `captured_location` | **`media.location_text`** already exists (0007). Reuse it. |
| `formatCapturedAt(date, precision)` | New helper in **`lib/format.ts`** (alongside `fullDate`, etc.); route the inline `fullDate(media.taken_at)` call sites through it. |
| access-scope column (for composite index) | There is no per-row access scope; everything family-facing is service-role after a viewer check. Index `taken_at` (and `(taken_at, id)` for cursoring) plainly. |
| revalidation/cache-invalidation pattern | **`router.refresh()`** (no `revalidatePath`). |
| "Browse" tab | `components/Nav.tsx` slot → `/browse` (`app/browse/page.tsx`, real). |
| "Board" surface | `/community` (`app/community/page.tsx` + `lib/community/events.ts` `getBoardEvents`, `kind='event'`). |
| event date | `events.event_date` is a **`date`** (day-granular); Prompt 04 says reuse the media temporal column concept — events have no `taken_at`, so Prompt 04 must decide how event date + precision map (likely add the same precision concept to events or reuse `event_date` + a precision). |
| reactions/comments for planned events | Already polymorphic on `collection_id` + `member_id`/`user_id` — reuse `lib/community/threads.ts` and `components/Reactions.tsx`/`Comments.tsx` with `collectionId`. |
| existing single-item date editor | `components/MemoryEditor.tsx` already renders Date + Location inputs and PATCHes `takenAt`/`location`; Prompt 02 extends it with precision + `source='user'`. |
</content>
</invoke>

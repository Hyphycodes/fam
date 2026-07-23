# Reel

A private, invite-only family media hub.

Anyone in the family drops photos and videos in from their phone. They play for
everyone, on any device, straight away. You can download the untouched original
of anything. And when everyone's together, one button turns the whole archive
into **Movie Mode** — a cinematic stream of memories on the TV or projector,
with music underneath that gets out of the way when a video has something to
say.

The name is a placeholder. Change `NEXT_PUBLIC_APP_NAME` and it's yours.

> **New here? Start with [SETUP.md](SETUP.md).** You need Supabase and
> Cloudflare accounts; it takes about half an hour and runs ~$15/month.

---

## How it's built

|                                       |                                                                   |
| ------------------------------------- | ----------------------------------------------------------------- |
| App                                   | Next.js 16 (App Router) + TypeScript, on Vercel                   |
| Auth + metadata                       | Supabase — passwordless magic links, Postgres, Row Level Security |
| Video                                 | Cloudflare Stream                                                 |
| Photos, originals, voice notes, music | Cloudflare R2 (private bucket, signed links)                      |
| Styling                               | Tailwind v4, CSS-first theme                                      |

### The one rule that matters

**Bytes never pass through our server.**

A video goes from the phone straight to Cloudflare Stream over tus (resumable —
it survives a dropped bar of signal). A photo goes straight to R2 through a
presigned PUT. Our API only ever mints the permission to upload, which is a few
hundred bytes.

If that ever gets "simplified" into proxying uploads through a route handler,
every large video will start failing on a serverless timeout. It is the load-
bearing decision in the whole app.

### Privacy

The R2 bucket is private and stays private; every image and download is a
short-lived signed URL generated per view (signing is local HMAC, so a whole
page of them costs nothing). Videos can be made private too — run
`npm run stream:signing-key` and playback starts requiring a signed token.

Sign-up is gated twice: the app checks the guest list before sending a link, and
a Postgres trigger on `auth.users` refuses any uninvited email even if someone
hits the Supabase endpoint directly.

---

## Layout

```
app/
  page.tsx                     home — "on this day", then the feed
  m/[id]/                      one memory: reactions, voice notes, notes, editing
  movie/                       Movie Mode
  browse/                      people, events, years
  collection/[kind]/[id]/      one filtered stream
  settings/                    invites, drop-off links, events, music
  add/[token]/                 public drop-off — no account needed
  setup/                       "here's what's still missing"
  api/                         upload permissions, feed, reactions, comments, …
components/                    Feed, Lightbox, MovieMode, AddMemories, …
lib/
  client/                      browser-side: uploads, HEIC/EXIF, reel editing, music
  queries.ts                   reads + signed-URL hydration
  stream.ts  r2.ts             Cloudflare
supabase/migrations/           the schema, as one runnable file
scripts/                       schema check, icons, signing key, R2 CORS
```

### Where the interesting decisions live

- **[`lib/client/uploader.ts`](lib/client/uploader.ts)** — the upload queue. Two
  at a time, tus for video with a chunk size that drops to 10 MiB on a slow
  connection, presigned PUTs for photos.
- **[`lib/client/media-prep.ts`](lib/client/media-prep.ts)** — HEIC decoding
  (native on iOS, JS decoder only as a fallback), display/thumb derivation, and
  a small EXIF reader so "4 years ago today" uses the day it was _taken_.
- **[`lib/client/reel.ts`](lib/client/reel.ts)** — the edit: how long each thing
  holds, where a title card earns its place. Every number that makes Movie Mode
  feel like a film instead of a slideshow is in that one file.
- **[`public/sw.js`](public/sw.js)** — media is cached by path with the
  signature stripped, so a re-signed URL still hits the cache. That's what makes
  offline browsing actually work.

---

## Commands

```bash
npm run dev              # http://localhost:3000
npm run build
npm run typecheck
npm run lint
npm test
npm run format -- path/to/file.ts
npm run check:sql        # apply migrations to a real Postgres and assert behaviour
npm run stream:signing-key   # turn on private video playback
npm run r2:cors          # the CORS rule browser uploads need
```

---

## What this deliberately isn't (yet)

No AI clip selection, no face recognition, no search-for-anything, no calendar
or family tree or recipes. All real, all later. Keeping v1 to _upload → feed →
play → Movie Mode → the human layer_ is the reason it ships and gets used —
which, with family, is the whole game.

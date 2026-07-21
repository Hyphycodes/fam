# Setting up Reel

Four accounts, about half an hour, roughly **$15/month** at family scale (mostly
Cloudflare Stream).

Work through this in order. At any point you can run `npm run dev` and open
<http://localhost:3000/setup> — it tells you exactly which keys are still
missing, by name.

---

## 1. Supabase — sign-in and all the metadata

1. [supabase.com](https://supabase.com) → **New project**. Name it `reel`, pick a
   region near you, set a database password and save it somewhere.
2. **Project Settings → API**, copy three values:
   | Supabase calls it | Goes in `.env.local` as |
   | --- | --- |
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
   | anon / public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | service_role key (secret) | `SUPABASE_SERVICE_ROLE_KEY` |
3. **Authentication → Providers → Email**: turn **Email** on and make sure
   **Confirm email** is on. That is what makes magic links work. You do not need
   a password provider at all.
4. **Authentication → URL Configuration**: set **Site URL** to your app URL
   (`http://localhost:3000` while building, your Vercel URL after deploying),
   and add both to **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   https://your-app.vercel.app/auth/callback
   ```
   Miss this and the sign-in link will bounce you to the wrong place.

### Run the migration

**SQL Editor → New query**, paste the whole of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), run it.
It is safe to run more than once.

That single file creates every table, turns on Row Level Security, and installs
the trigger that refuses any signup whose email isn't on the guest list.

> Want to check it before you run it? `npm run check:sql` applies the migration
> to a real Postgres in-process and asserts the invite gate, the RLS policies
> and the "on this day" columns all behave.

---

## 2. Cloudflare Stream — video

Stream is the paid piece. It swallows whatever the family films — HEVC, ancient
`.MOV`, camcorder files — and converts it so it plays on every phone, laptop and
projector without you ever touching a codec.

1. Create a Cloudflare account. Your **Account ID** is on the right of the
   dashboard home → `CLOUDFLARE_ACCOUNT_ID`.
2. Open **Stream** and activate it (a $5 storage block).
3. **My Profile → API Tokens → Create Token → Custom token**, give it
   **Stream: Edit** → `CLOUDFLARE_STREAM_API_TOKEN`.
4. On the Stream page find your customer subdomain — the `customer-XXXX` part of
   `customer-XXXX.cloudflarestream.com` → `NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE`.

### Make videos private (recommended)

By default a Stream video plays for anyone who knows its ID. To require a
short-lived token instead:

```bash
npm run stream:signing-key
```

It prints `CLOUDFLARE_STREAM_SIGNING_KEY_ID` and
`CLOUDFLARE_STREAM_SIGNING_KEY_JWK`. Add both, redeploy, and every video
uploaded from then on is private. Cloudflare shows the key once — save it.

---

## 3. Cloudflare R2 — photos, originals, voice notes

1. **R2 → Create bucket**, name it `reel-media` → `R2_BUCKET_NAME`.
   (~$0.015/GB/month, and **no charge for downloads**.)
2. **R2 → Manage R2 API Tokens → Create**, with **Object Read & Write** on that
   bucket:
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
3. `R2_ENDPOINT` is `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`

**Leave the bucket private.** The app hands out short-lived signed links, one per
file, per view. Nothing is ever on a public URL.

### CORS — do not skip this

The phone uploads photos *straight to R2*, which means the browser needs
permission. Without it, videos will upload fine and photos will fail with an
opaque CORS error.

```bash
npm run r2:cors
```

If it can't authenticate it prints the exact JSON to paste into
**R2 → your bucket → Settings → CORS Policy → Add CORS policy → JSON**.

After deploying, run it again with your live URL:

```bash
npm run r2:cors -- https://your-app.vercel.app
```

> Cloudflare has *two* different CORS JSON formats — the dashboard uses one, the
> API and wrangler use another. The script knows the difference; if you're
> copying from somewhere else, that's a likely reason it silently doesn't work.

---

## 4. Your `.env.local`

```bash
cp .env.local.example .env.local
```

Fill it in, and set `OWNER_EMAIL` to **your** email. That is the one address
seeded onto the guest list automatically — without it, nobody can get in,
including you. Everyone else you invite from inside the app.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, enter your email, click the link in your inbox.

---

## 5. Vercel

1. Push to GitHub (already done if you're reading this in the repo).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. **Settings → Environment Variables**: paste in every line from `.env.local`.
   Set `NEXT_PUBLIC_APP_URL` to the Vercel URL.
4. Deploy.
5. Go back to Supabase → **Authentication → URL Configuration** and add the
   Vercel `/auth/callback` URL if you haven't.
6. Run `npm run r2:cors -- https://your-app.vercel.app`.

`vercel.json` pins `"framework": "nextjs"` — leave it there. A Vercel project
that ends up with `framework: null` builds fine and then 404s every route, which
is a miserable hour to debug.

---

## Checks

| Command | What it does |
| --- | --- |
| `npm run check:sql` | Applies the migration to a real Postgres and asserts the schema behaves |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

---

## When something goes wrong

**"That email is not on the family list yet"** — `OWNER_EMAIL` isn't set, or you
typed a different address. It's checked case-insensitively.

**The sign-in link goes somewhere strange** — Supabase → Authentication → URL
Configuration. Site URL and Redirect URLs both need to match where you're
actually running.

**Videos upload, photos don't** — R2 CORS. See above.

**Photo uploads fail with 403 SignatureDoesNotMatch** — something is rewriting
the `Content-Type` header. R2 signs it, so it has to arrive exactly as sent.

**A video sits on "still coming through" for ages** — that's Cloudflare
transcoding, and a long 4K clip genuinely takes a few minutes. The page picks it
up on its own. If it fails, the memory says so and offers a retry.

**Everything 404s on Vercel** — `framework: null` on the project. Confirm
`vercel.json` is committed and redeploy.

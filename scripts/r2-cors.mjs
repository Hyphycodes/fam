/**
 * Applies the R2 bucket CORS rule that browser uploads need.
 *
 * Without it, the phone's presigned PUT is blocked by the browser before it
 * ever reaches Cloudflare, and photo uploads fail with a CORS error that says
 * nothing useful. This is the single most common reason a fresh install can
 * upload videos but not photos.
 *
 *   npm run r2:cors                     # apply for localhost + NEXT_PUBLIC_APP_URL
 *   npm run r2:cors -- https://x.app    # add another origin
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  try {
    const text = readFileSync(path.join(root, '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!match) continue
      const value = match[2].trim().replace(/^["']|["']$/g, '').split('   #')[0].trim()
      if (value && !process.env[match[1]]) process.env[match[1]] = value
    }
  } catch {
    // Env may come from the shell instead.
  }
}

loadEnv()

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const bucket = process.env.R2_BUCKET_NAME
// R2 CORS is managed through the Cloudflare API, so this needs an account-level
// token with R2 edit rights — the same one works if it has both scopes.
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_STREAM_API_TOKEN

const origins = [
  ...new Set(
    [
      'http://localhost:3000',
      process.env.NEXT_PUBLIC_APP_URL,
      ...process.argv.slice(2),
    ]
      .filter(Boolean)
      // Origins are scheme://host[:port] — no trailing slash, no path.
      .map((value) => {
        try {
          return new URL(value).origin
        } catch {
          return null
        }
      })
      .filter(Boolean),
  ),
]

// This is the shape the Cloudflare v4 API wants. The dashboard's JSON tab uses
// a *different* schema (a PascalCase top-level array) — they are not
// interchangeable, which is why the dashboard version is printed separately.
const rules = {
  rules: [
    {
      id: 'reel-browser-uploads',
      allowed: {
        origins,
        methods: ['PUT', 'GET', 'HEAD'],
        headers: ['Content-Type'],
      },
      exposeHeaders: ['ETag'],
      maxAgeSeconds: 3600,
    },
  ],
}

const dashboardEquivalent = [
  {
    AllowedOrigins: origins,
    AllowedMethods: ['PUT', 'GET', 'HEAD'],
    AllowedHeaders: ['Content-Type'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  },
]

if (!accountId || !bucket || !token) {
  console.log(`
  Not enough credentials to apply this automatically (needs
  CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME and CLOUDFLARE_API_TOKEN).

  Paste this by hand instead — Cloudflare dashboard → R2 → ${bucket ?? 'your bucket'}
  → Settings → CORS Policy → Add CORS policy → JSON:

${JSON.stringify(dashboardEquivalent, null, 2)}
`)
  process.exit(0)
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/cors`,
  {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(rules),
  },
)

const payload = await response.json().catch(() => ({}))

if (!response.ok || payload.success === false) {
  console.error(`
  Could not set it automatically: ${JSON.stringify(payload.errors ?? payload)}

  Paste this in the dashboard instead — R2 → ${bucket} → Settings → CORS Policy → JSON:

${JSON.stringify(dashboardEquivalent, null, 2)}
`)
  process.exit(1)
}

console.log(`
  CORS applied to "${bucket}" for:
${origins.map((origin) => `    ${origin}`).join('\n')}

  Rules can take up to 30 seconds to propagate. Re-run this with your production
  URL after the first deploy:  npm run r2:cors -- https://your-app.vercel.app
`)

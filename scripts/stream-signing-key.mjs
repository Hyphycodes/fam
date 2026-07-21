/**
 * Creates a Cloudflare Stream signing key and prints the two env vars that turn
 * on private video playback.
 *
 * Without this, a video is viewable by anyone who knows its UID. With it, every
 * playback URL carries a short-lived token that only this app can mint.
 *
 *   npm run stream:signing-key
 *
 * Cloudflare shows the key material exactly once, so save the output.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal .env.local reader — no dependency needed for six lines of parsing. */
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
const token = process.env.CLOUDFLARE_STREAM_API_TOKEN

if (!accountId || !token) {
  console.error(
    '\n  Need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN in .env.local first.\n',
  )
  process.exit(1)
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/keys`,
  { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
)

const payload = await response.json()

if (!response.ok || !payload.success) {
  console.error('\n  Cloudflare refused:', JSON.stringify(payload.errors ?? payload, null, 2))
  console.error('\n  The API token needs the "Stream: Edit" permission.\n')
  process.exit(1)
}

const { id, jwk } = payload.result

console.log(`
  Signing key created. Add these two lines to .env.local — and to your Vercel
  project's Environment Variables — then redeploy:

CLOUDFLARE_STREAM_SIGNING_KEY_ID=${id}
CLOUDFLARE_STREAM_SIGNING_KEY_JWK=${jwk}

  Cloudflare will not show this key again, so don't lose it.

  From here on, newly uploaded videos are marked private and every playback URL
  carries a short-lived token. Videos uploaded BEFORE now stay public-by-UID
  until you flip them:

  curl -X POST "https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/<VIDEO_UID>" \\
    -H "Authorization: Bearer $CLOUDFLARE_STREAM_API_TOKEN" \\
    -H "Content-Type: application/json" \\
    -d '{"uid":"<VIDEO_UID>","requireSignedURLs":true}'
`)

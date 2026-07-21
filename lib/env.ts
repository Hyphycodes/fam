/**
 * Environment access.
 *
 * Nothing in here throws at import time. A missing key should send you to a
 * setup screen that tells you exactly what's missing — not a stack trace on a
 * white page, and not a build that dies on Vercel before you've had a chance to
 * paste anything in.
 */

export const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'Reel'

export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  // Vercel sets this on every deployment, so previews link to themselves.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}

type Group = 'supabase' | 'stream' | 'r2'

const REQUIRED: Record<Group, string[]> = {
  supabase: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
  stream: [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_STREAM_API_TOKEN',
    'NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE',
  ],
  r2: [
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_ENDPOINT',
  ],
}

/**
 * NEXT_PUBLIC_* values are inlined at build time, so they can only be read as
 * literal property accesses — `process.env[name]` would come back undefined in
 * the browser bundle.
 */
const PUBLIC_VALUES: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE:
    process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE,
}

function read(name: string): string | undefined {
  const value = name.startsWith('NEXT_PUBLIC_') ? PUBLIC_VALUES[name] : process.env[name]
  return value?.trim() || undefined
}

export function missing(group: Group): string[] {
  return REQUIRED[group].filter((name) => !read(name))
}

export function isConfigured(group: Group): boolean {
  return missing(group).length === 0
}

/** Every group that still needs keys, for the setup screen. */
export function setupStatus() {
  return (Object.keys(REQUIRED) as Group[]).map((group) => ({
    group,
    missing: missing(group),
    ok: missing(group).length === 0,
  }))
}

/** Throws with a message naming the exact variable — used inside server routes. */
export function require_(name: string): string {
  const value = read(name)
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local (see .env.local.example) and to your Vercel project's Environment Variables.`,
    )
  }
  return value
}

export const supabaseUrl = () => require_('NEXT_PUBLIC_SUPABASE_URL')
export const supabaseAnonKey = () => require_('NEXT_PUBLIC_SUPABASE_ANON_KEY')
export const supabaseServiceKey = () => require_('SUPABASE_SERVICE_ROLE_KEY')

export const ownerEmail = () => process.env.OWNER_EMAIL?.trim().toLowerCase() || null

/**
 * The one shared family passcode. Server-only — never inlined into the browser
 * bundle. Absent means the passcode gate is closed and only legacy magic-link
 * sign-in works, which is the safe default.
 */
export const familyPasscode = () => process.env.FAMILY_PASSCODE?.trim() || null
export const hasFamilyPasscode = () => Boolean(familyPasscode())

export const streamCustomerCode = () =>
  require_('NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE')

/** Stream signed playback is opt-in; without a key, videos play by UID. */
export function streamSigningKey(): { id: string; jwk: string } | null {
  const id = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID?.trim()
  const jwk = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_JWK?.trim()
  return id && jwk ? { id, jwk } : null
}

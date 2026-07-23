import { fail, handleError, ok } from '@/lib/api'
import { getViewer } from '@/lib/viewer'
import { readDb } from '@/lib/db'
import { isConfigured } from '@/lib/env'
import { checkR2Health } from '@/lib/r2'

/**
 * Owner-only, read-only production readiness probe. It verifies the exact
 * columns used by the importer instead of assuming a successful deployment
 * also means the Supabase migrations were applied.
 */
export async function GET() {
  try {
    const viewer = await getViewer()
    if (!viewer) return fail('Sign in first.', 401)
    if (viewer.role !== 'owner') return fail('Owner only.', 403)

    const db = readDb()
    const [mediaSchema, schemaVersion, r2] = await Promise.all([
      db.from('media').select('content_hash, location_text, crop_metadata').limit(1),
      db.rpc('reel_schema_version'),
      checkR2Health().catch((error) => ({
        configured: isConfigured('r2'),
        missingVars: [],
        reachable: false,
        error: error instanceof Error ? error.message : 'R2 health check failed.',
      })),
    ])

    const migrations = {
      mediaImportMetadata: !mediaSchema.error,
      personIdentityLinks: !schemaVersion.error && schemaVersion.data === 8,
    }
    const streamConfigured = isConfigured('stream')
    const ready =
      migrations.mediaImportMetadata &&
      migrations.personIdentityLinks &&
      streamConfigured &&
      r2.reachable

    return ok({
      ready,
      migrations,
      storage: {
        r2,
        streamConfigured,
      },
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    return handleError(error, 'debug/readiness')
  }
}

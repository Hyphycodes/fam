import { fail, handleError, ok } from '@/lib/api'
import { getViewer } from '@/lib/viewer'
import { checkR2Health } from '@/lib/r2'

/**
 * "Is R2 actually working right now?" — owner-only, read-only, and it really
 * asks Cloudflare (a HeadBucket call) rather than just checking that the env
 * vars exist. Exists so a storage misconfiguration is a definite yes/no
 * instead of a guess from a vague upload error.
 */
export async function GET() {
  try {
    const viewer = await getViewer()
    if (!viewer) return fail('Sign in first.', 401)
    if (viewer.role !== 'owner') return fail('Owner only.', 403)

    const health = await checkR2Health()
    return ok(health)
  } catch (error) {
    return handleError(error, 'debug/r2')
  }
}

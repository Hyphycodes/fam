import { randomBytes } from 'node:crypto'
import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { appUrl } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * "Add your photos and videos from the Water Party" — a link anyone can open,
 * with no account and no tour of the app, that drops media into one event.
 */

export async function GET() {
  try {
    const session = await getSession()
    if (session?.profile.role !== 'owner') return fail('Only the owner can see this.', 403)

    const admin = createAdminClient()
    const { data } = await admin
      .from('event_upload_links')
      .select('*, events(name)')
      .order('created_at', { ascending: false })

    return ok({
      links: (data ?? []).map((link: Record<string, unknown> & { token: string }) => ({
        ...link,
        url: `${appUrl()}/add/${link.token}`,
      })),
    })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (session?.profile.role !== 'owner') return fail('Only the owner can make links.', 403)

    const { eventId, label, expiresInDays } = await readJson<{
      eventId?: string
      label?: string
      expiresInDays?: number
    }>(request)

    if (!eventId) return fail('Pick an event for the link to fill.')

    const admin = createAdminClient()
    const { data: event } = await admin
      .from('events')
      .select('id, name')
      .eq('id', eventId)
      .maybeSingle()
    if (!event) return fail('That event does not exist.')

    // 192 bits of URL-safe randomness — this token is the only thing standing
    // between a stranger and your family's event.
    const token = randomBytes(24).toString('base64url')

    const days = Number(expiresInDays)
    const expiresAt =
      Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 86_400_000).toISOString()
        : null

    const { data, error } = await admin
      .from('event_upload_links')
      .insert({
        event_id: eventId,
        token,
        label: (label ?? '').trim() || null,
        created_by: session.userId,
        expires_at: expiresAt,
      })
      .select('*')
      .single()

    if (error) return fail(`Could not make that link: ${error.message}`, 500)
    return ok({ link: { ...data, url: `${appUrl()}/add/${token}` } })
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (session?.profile.role !== 'owner') return fail('Only the owner can do that.', 403)

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return fail('Which link?')

    const admin = createAdminClient()
    await admin
      .from('event_upload_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)

    return ok({ revoked: true })
  } catch (error) {
    return handleError(error)
  }
}

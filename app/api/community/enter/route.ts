import { fail, handleError, ok, readJson } from '@/lib/api'
import { enterWithPasscode } from '@/lib/member'
import { hasFamilyPasscode } from '@/lib/env'

/**
 * The family door. First name + the shared passcode. No email, no password to
 * remember — the low-friction "walking into a family thing" the app is for.
 */
export async function POST(request: Request) {
  try {
    if (!hasFamilyPasscode()) {
      return fail('The passcode door is not set up yet. Ask the family organizer.', 503)
    }

    const { firstName, lastInitial, passcode } = await readJson<{
      firstName?: string
      lastInitial?: string
      passcode?: string
    }>(request)

    const result = await enterWithPasscode(
      firstName ?? '',
      passcode ?? '',
      lastInitial,
      request.headers.get('user-agent') ?? undefined,
    )

    if (!result.ok) {
      return Response.json(
        { error: result.error, needsInitial: result.needsInitial, choices: result.choices },
        { status: result.needsInitial ? 409 : 401 },
      )
    }

    return ok({ ok: true })
  } catch (error) {
    return handleError(error, 'community/enter')
  }
}

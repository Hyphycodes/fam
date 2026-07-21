import { notFound } from 'next/navigation'
import { PublicDropOff } from '@/components/PublicDropOff'
import { appName, isConfigured } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * The drop-off page.
 *
 * No account, no sign-in, no explanation of what the app is — someone taps a
 * link from the group chat and adds their photos from the cookout. The token in
 * the URL is the whole credential, and it decides which event they land in.
 */
export default async function DropOffPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  if (!isConfigured('supabase')) notFound()

  const { token } = await params
  const admin = createAdminClient()

  const { data: link } = await admin
    .from('event_upload_links')
    .select('token, expires_at, revoked_at, events(name, event_date)')
    .eq('token', token)
    .maybeSingle()

  if (!link || link.revoked_at) return <Closed reason="This link has been turned off." />
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <Closed reason="This link has expired." />
  }

  // PostgREST hands back an embedded relation as an object or a one-item array
  // depending on version — accept both rather than guess.
  const raw = link.events as unknown
  const event = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null

  return <PublicDropOff token={token} eventName={event?.name ?? 'the family'} />
}

function Closed({ reason }: { reason: string }) {
  return (
    <main className="lamplight relative flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-title leading-tight text-balance">{reason}</h1>
        <p className="mt-4 text-paper-dim">
          Ask whoever sent it for a fresh one and we&rsquo;ll get your photos into {appName}.
        </p>
      </div>
    </main>
  )
}

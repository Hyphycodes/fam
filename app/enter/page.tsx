import Link from 'next/link'
import { redirect } from 'next/navigation'
import { appName, hasFamilyPasscode, isConfigured } from '@/lib/env'
import { getViewer } from '@/lib/viewer'
import { listMemberNames } from '@/lib/member'
import { NameEntry } from '@/components/NameEntry'

export const dynamic = 'force-dynamic'

/** The family door: first name + shared passcode. Low-friction by design. */
export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  if (!isConfigured('supabase')) redirect('/setup')
  if (await getViewer()) redirect('/')

  const { next } = await searchParams
  const names = hasFamilyPasscode() ? await listMemberNames() : []

  return (
    <main className="relative flex min-h-dvh flex-col justify-center px-6 py-20">
      <div className="relative mx-auto w-full max-w-sm">
        <p className="mb-5 text-[11px] tracking-[0.3em] text-paper-faint uppercase">
          {appName}
        </p>
        <h1 className="text-[clamp(2.75rem,10vw,4rem)] leading-[0.95] font-semibold tracking-[-0.03em] text-balance">
          Sign in
        </h1>
        <p className="mt-5 text-lg text-paper-soft text-balance">
          Enter your name and the family passcode.
        </p>

        {hasFamilyPasscode() ? (
          <NameEntry names={names} next={next} />
        ) : (
          <div className="mt-10 rounded-xl border border-edge bg-ink-raised px-5 py-4">
            <p className="text-sm leading-relaxed text-paper-dim">
              The passcode door isn&rsquo;t set up yet. In the meantime you can{' '}
              <Link href="/login" className="text-paper underline underline-offset-4">
                sign in by email
              </Link>
              .
            </p>
          </div>
        )}

        <p className="mt-8 text-xs text-paper-faint">
          Prefer email?{' '}
          <Link href="/login" className="text-paper-dim underline underline-offset-4 hover:text-paper">
            Sign in with a link
          </Link>
        </p>
      </div>
    </main>
  )
}

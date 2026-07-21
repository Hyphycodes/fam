import { redirect } from 'next/navigation'
import { appName, isConfigured } from '@/lib/env'
import { getSession } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  expired: 'That link has already been used, or it sat too long. Here is a fresh one.',
  failed: 'That link did not work. Try sending another.',
  'missing-code': 'That link was incomplete. Try sending another.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  if (!isConfigured('supabase')) redirect('/setup')
  if (await getSession()) redirect('/')

  const { next, error } = await searchParams

  return (
    <main className="lamplight relative flex min-h-dvh flex-col justify-center px-6 py-20">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display text-display leading-[0.9]">{appName}</h1>
        <p className="mt-5 text-lg text-paper-soft text-balance">
          Everything we&rsquo;ve been meaning to put somewhere. Just us.
        </p>

        {error && ERRORS[error] && (
          <p className="mt-8 rounded-xl border border-ember-deep/40 bg-ember-deep/10 px-4 py-3 text-sm text-ember-soft">
            {ERRORS[error]}
          </p>
        )}

        <LoginForm next={next} />
      </div>
    </main>
  )
}

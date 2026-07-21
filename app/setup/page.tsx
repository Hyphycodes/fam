import Link from 'next/link'
import { appName, setupStatus } from '@/lib/env'

export const dynamic = 'force-dynamic'

const EXPLAIN: Record<string, { title: string; why: string; where: string }> = {
  supabase: {
    title: 'Supabase',
    why: 'Sign-in links and every caption, comment and reaction.',
    where: 'Supabase dashboard → Project Settings → API',
  },
  stream: {
    title: 'Cloudflare Stream',
    why: 'Holds the videos and converts whatever the family films into something that plays everywhere.',
    where: 'Cloudflare dashboard → Stream, and My Profile → API Tokens',
  },
  r2: {
    title: 'Cloudflare R2',
    why: 'Holds the photos, the untouched originals, and voice notes.',
    where: 'Cloudflare dashboard → R2 → Manage R2 API Tokens',
  },
}

/**
 * The screen you get instead of a stack trace when a key is missing. Reachable
 * without signing in, because until Supabase is configured nobody can.
 */
export default function SetupPage() {
  const status = setupStatus()
  const ready = status.every((group) => group.ok)

  return (
    <main className="lamplight relative mx-auto min-h-dvh max-w-2xl px-6 py-20">
      <h1 className="font-display text-display leading-none">{appName}</h1>
      <p className="mt-6 text-lg text-paper-soft text-balance">
        {ready
          ? 'Everything is connected. You can close this page.'
          : 'Almost there — a few keys are still missing.'}
      </p>

      <div className="mt-14 space-y-4">
        {status.map((group) => {
          const info = EXPLAIN[group.group]
          return (
            <section key={group.group} className="card p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-2xl">{info.title}</h2>
                <span
                  className={`text-sm ${group.ok ? 'text-ember' : 'text-paper-dim'}`}
                >
                  {group.ok ? 'connected' : 'not yet'}
                </span>
              </div>

              <p className="mt-2 text-sm text-paper-dim">{info.why}</p>

              {!group.ok && (
                <>
                  <ul className="mt-4 space-y-1.5">
                    {group.missing.map((name) => (
                      <li key={name} className="font-mono text-sm text-ember-soft">
                        {name}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-paper-faint">Find these in: {info.where}</p>
                </>
              )}
            </section>
          )
        })}
      </div>

      <div className="mt-14 space-y-3 text-sm text-paper-dim">
        <p>
          Put them in <code className="text-paper-soft">.env.local</code> for local work, and in
          your Vercel project under Settings → Environment Variables for the deployed site.
          Restart the dev server after editing the file.
        </p>
        <p>
          The full walkthrough — including the database migration and the R2 CORS rule that
          browser uploads need — is in{' '}
          <code className="text-paper-soft">SETUP.md</code>.
        </p>
      </div>

      {ready && (
        <Link href="/" className="btn btn-primary mt-10">
          Go to {appName}
        </Link>
      )}
    </main>
  )
}

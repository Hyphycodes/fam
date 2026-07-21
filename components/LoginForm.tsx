'use client'

import { useState } from 'react'

/** Email in, link out. No passwords anywhere in this app. */
export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setState('sending')
    setError(null)

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.error ?? 'That did not work. Try again?')
        setState('idle')
        return
      }
      setState('sent')
    } catch {
      setError('No connection. Check your signal and try again.')
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <div className="mt-10 animate-rise">
        <p className="font-display text-3xl leading-snug text-balance">
          Check your email.
        </p>
        <p className="mt-3 text-paper-dim">
          We sent a link to <span className="text-paper-soft">{email}</span>. Tap it on the
          phone you want to use — no password to remember.
        </p>
        <button
          onClick={() => {
            setState('idle')
            setError(null)
          }}
          className="mt-8 text-sm text-paper-dim underline underline-offset-4 transition-colors hover:text-paper"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-4">
      <input
        type="email"
        required
        autoFocus
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="field text-lg"
        aria-label="Your email address"
      />

      <button
        type="submit"
        disabled={state === 'sending' || !email}
        className="btn btn-primary w-full py-3.5"
      >
        {state === 'sending' ? 'Sending…' : 'Send me a link'}
      </button>

      {error && <p className="pt-1 text-sm text-ember-soft">{error}</p>}

      <p className="pt-4 text-xs leading-relaxed text-paper-faint">
        Invite only. If your email isn&rsquo;t on the list yet, ask whoever sent you here to
        add it.
      </p>
    </form>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface NameOption {
  first_name: string
  last_initial: string | null
  display_name: string
}

/**
 * The passcode door. First name (with a quiet autocomplete of the family) plus
 * the shared code. If a name is shared, we ask for a last initial only then —
 * never up front.
 */
export function NameEntry({ names, next }: { names: NameOption[]; next?: string }) {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [passcode, setPasscode] = useState('')
  const [needsInitial, setNeedsInitial] = useState(false)
  const [state, setState] = useState<'idle' | 'checking'>('idle')
  const [error, setError] = useState<string | null>(null)

  const firstNames = useMemo(
    () => [...new Set(names.map((n) => n.first_name))].sort(),
    [names],
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setState('checking')
    setError(null)
    try {
      const response = await fetch('/api/community/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastInitial, passcode }),
      })
      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        router.replace(next || '/')
        router.refresh()
        return
      }
      if (data.needsInitial) setNeedsInitial(true)
      setError(data.error ?? 'That did not work. Try again?')
      setState('idle')
    } catch {
      setError('No connection. Check your signal and try again.')
      setState('idle')
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs text-paper-faint">Your name</span>
        <input
          list="family-names"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="words"
          placeholder="First name"
          value={firstName}
          onChange={(event) => {
            setFirstName(event.target.value)
            setNeedsInitial(false)
          }}
          className="field text-lg"
          aria-label="Your first name"
        />
        <datalist id="family-names">
          {firstNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>

      {needsInitial && (
        <label className="block animate-rise">
          <span className="mb-1.5 block text-xs text-paper-faint">
            There&rsquo;s more than one {firstName.trim()} — your last initial
          </span>
          <input
            required
            maxLength={2}
            autoCapitalize="characters"
            placeholder="e.g. R"
            value={lastInitial}
            onChange={(event) => setLastInitial(event.target.value)}
            className="field w-24 text-lg uppercase"
            aria-label="Your last initial"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs text-paper-faint">Family passcode</span>
        <input
          type="password"
          required
          autoComplete="off"
          placeholder="••••••"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          className="field text-lg"
          aria-label="Family passcode"
        />
      </label>

      <button
        type="submit"
        disabled={state === 'checking' || !firstName || !passcode}
        className="btn btn-primary w-full py-3.5"
      >
        {state === 'checking' ? 'Checking…' : 'Continue'}
      </button>

      {error && <p className="pt-1 text-sm text-paper-soft">{error}</p>}

      <p className="pt-3 text-xs leading-relaxed text-paper-faint">
        Family only. If your name isn&rsquo;t on the list, ask whoever runs this to add you.
      </p>
    </form>
  )
}

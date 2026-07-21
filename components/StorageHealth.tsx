'use client'

import { useState } from 'react'
import type { R2Health } from '@/lib/r2'

/**
 * A live yes/no for "is photo storage actually working" — owner-only. Exists
 * because the only other way to answer that question was reading server logs
 * nobody but Vercel itself can see; this asks Cloudflare directly and says so
 * in plain language.
 */
export function StorageHealth() {
  const [state, setState] = useState<'idle' | 'checking' | 'done'>('idle')
  const [health, setHealth] = useState<R2Health | null>(null)

  async function check() {
    setState('checking')
    try {
      const response = await fetch('/api/debug/r2')
      const data = (await response.json()) as R2Health
      setHealth(data)
    } catch {
      setHealth(null)
    } finally {
      setState('done')
    }
  }

  return (
    <div>
      <button onClick={check} disabled={state === 'checking'} className="btn btn-ghost">
        {state === 'checking' ? 'Checking…' : 'Check photo storage (R2)'}
      </button>

      {state === 'done' && (
        <div className="mt-3 rounded-xl border border-edge bg-ink-high px-4 py-3 text-sm animate-rise">
          {health === null ? (
            <p className="text-paper-dim">Could not run the check. Try again in a moment.</p>
          ) : !health.configured ? (
            <p className="text-paper-dim">
              Not set up yet — missing{' '}
              <span className="text-paper">{health.missingVars.join(', ')}</span> in the
              server&rsquo;s environment variables. This is why photo uploads fail while
              videos still work.
            </p>
          ) : health.reachable ? (
            <p className="text-paper-soft">✓ Storage is configured and Cloudflare answered — photo uploads should work.</p>
          ) : (
            <p className="text-paper-dim">
              The check did not succeed:{' '}
              <span className="text-paper">{health.error}</span>. Double-check the R2 access
              key, secret, endpoint and bucket name in Vercel&rsquo;s Environment Variables.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

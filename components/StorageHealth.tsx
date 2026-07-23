'use client'

import { useState } from 'react'
import type { R2Health } from '@/lib/r2'

/**
 * A live yes/no for "is photo storage actually working" — owner-only. Exists
 * because the only other way to answer that question was reading server logs
 * nobody but Vercel itself can see; this asks Cloudflare directly and says so
 * in plain language, showing the exact bucket/endpoint this deployment is
 * actually using — not what the dashboard says it should be.
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
            <p className="text-paper-dim">Could not run the check. Try again.</p>
          ) : !health.configured ? (
            <p className="text-paper-dim">
              Not set up yet — missing{' '}
              <span className="text-paper">{health.missingVars.join(', ')}</span> in the
              server&rsquo;s environment variables. This is why photo uploads fail while
              videos still work.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="meta-mono text-paper-faint">
                bucket: <span className="text-paper-soft">{health.bucket}</span>
                <br />
                endpoint: <span className="text-paper-soft">{health.endpointHost}</span>
              </p>
              {health.reachable ? (
                <>
                  <p className="text-paper-soft">
                    ✓ Cloudflare answered — this bucket is reachable with the current
                    credentials.
                  </p>
                  {typeof health.objectCount === 'number' ? (
                    <p className="text-paper-dim">
                      {health.objectCount} object{health.objectCount === 1 ? '' : 's'} in this
                      bucket right now
                      {health.sampleKeys && health.sampleKeys.length > 0 && (
                        <>
                          , including <span className="text-paper">{health.sampleKeys[0]}</span>
                        </>
                      )}
                      .
                    </p>
                  ) : (
                    <p className="text-paper-dim">
                      (Couldn&rsquo;t list objects — the R2 token may not have list
                      permission. That&rsquo;s separate from upload/download working.)
                    </p>
                  )}
                </>
              ) : (
                <p className="text-paper-dim">
                  The check did not succeed:{' '}
                  <span className="text-paper">{health.error}</span>. Double-check the R2
                  access key, secret, endpoint and bucket name in Vercel&rsquo;s Environment
                  Variables — and that the bucket name above is the one CORS was actually
                  applied to.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

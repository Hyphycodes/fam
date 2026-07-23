'use client'

import { useState } from 'react'
import { AddMemoriesButton } from '@/components/AddMemories'

/**
 * What a relative sees when they tap the link from the group chat.
 *
 * One question (their name, so the memories aren't anonymous), one button. No
 * account, no tour, no explanation of what a family media hub is.
 */
export function PublicDropOff({
  token,
  eventName,
}: {
  token: string
  eventName: string
}) {
  const [name, setName] = useState('')
  const [ready, setReady] = useState(false)

  return (
    <main className="lamplight relative flex min-h-dvh flex-col justify-center px-6 py-20">
      <div className="mx-auto w-full max-w-md">
        <p className="mb-4 text-xs tracking-[0.3em] text-paper-faint uppercase">
          Add your photos
        </p>
        <h1 className="font-display text-[clamp(2.5rem,10vw,4.5rem)] leading-[0.95] text-balance">
          {eventName}
        </h1>

        {!ready ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setReady(true)
            }}
            className="mt-10 space-y-4"
          >
            <p className="text-lg text-paper-soft text-balance">
              Enter your name before selecting photos or videos.
            </p>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoFocus
              className="field text-lg"
              aria-label="Your name"
            />
            <button type="submit" disabled={!name.trim()} className="btn btn-primary w-full py-3.5">
              Continue
            </button>
          </form>
        ) : (
          <div className="mt-10 animate-rise">
            <p className="text-lg text-paper-soft text-balance">
              Select the photos and videos you want to add, then review them before uploading.
            </p>
            <div className="mt-8">
              <AddMemoriesButton
                variant="hero"
                context={{ linkToken: token, uploaderLabel: name.trim() }}
              />
            </div>
            <p className="mt-8 text-sm leading-relaxed text-paper-faint">
              Keep this page open until uploading finishes. This link only adds to {eventName}.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

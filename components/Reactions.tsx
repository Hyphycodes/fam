'use client'

import { useEffect, useState } from 'react'

const EMOJI = ['❤️', '😂', '🔥', '🥹', '👏', '😮']

interface Reaction {
  id: string
  emoji: string
  user_id: string
  name: string
}

/** Tap to react, tap again to take it back. Hover to see who. */
export function Reactions({ mediaId, userId }: { mediaId: string; userId: string }) {
  const [reactions, setReactions] = useState<Reaction[]>([])

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/media/${mediaId}/reactions`)
      if (response.ok) {
        const data = (await response.json()) as { reactions: Reaction[] }
        setReactions(data.reactions)
      }
    })()
  }, [mediaId])

  async function toggle(emoji: string) {
    const mine = reactions.find((r) => r.emoji === emoji && r.user_id === userId)

    // Optimistic — a reaction that waits for a round trip feels broken.
    setReactions((current) =>
      mine
        ? current.filter((r) => r.id !== mine.id)
        : [...current, { id: `pending-${emoji}`, emoji, user_id: userId, name: 'You' }],
    )

    const response = await fetch(`/api/media/${mediaId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    })

    // Re-sync so a failed toggle doesn't leave a lie on screen.
    const fresh = await fetch(`/api/media/${mediaId}/reactions`)
    if (fresh.ok) {
      const data = (await fresh.json()) as { reactions: Reaction[] }
      setReactions(data.reactions)
    } else if (!response.ok) {
      setReactions((current) => current.filter((r) => !r.id.startsWith('pending-')))
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {EMOJI.map((emoji) => {
        const forThis = reactions.filter((r) => r.emoji === emoji)
        const mine = forThis.some((r) => r.user_id === userId)

        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji)}
            title={forThis.map((r) => r.name).join(', ')}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-all ${
              mine
                ? 'border-ember-deep bg-ember-deep/20 text-paper'
                : 'border-edge text-paper-dim hover:border-edge-strong hover:bg-ink-hover'
            }`}
          >
            <span className="text-base leading-none">{emoji}</span>
            {forThis.length > 0 && <span className="text-xs">{forThis.length}</span>}
          </button>
        )
      })}
    </div>
  )
}

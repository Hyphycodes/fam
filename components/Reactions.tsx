'use client'

import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'

const EMOJI = ['❤️', '😂', '🔥', '🥹', '👏', '😮']

interface ReactionView {
  id: string
  emoji: string
  name: string
  avatar_url: string | null
  mine: boolean
}

/**
 * Tap to react, tap again to take it back. Below the row sits a quiet stack of
 * everyone who reacted — faces, not a number.
 *
 * `subject` lets one component serve both a media item and a board event.
 */
export function Reactions({
  mediaId,
  collectionId,
}: {
  mediaId?: string
  collectionId?: string
}) {
  const base = mediaId ? `/api/media/${mediaId}/reactions` : `/api/collections/${collectionId}/reactions`
  const [reactions, setReactions] = useState<ReactionView[]>([])

  async function load() {
    const response = await fetch(base)
    if (response.ok) {
      const data = (await response.json()) as { reactions: ReactionView[] }
      setReactions(data.reactions)
    }
  }

  useEffect(() => {
    let live = true
    void (async () => {
      const response = await fetch(base)
      if (!live || !response.ok) return
      const data = (await response.json()) as { reactions: ReactionView[] }
      setReactions(data.reactions)
    })()
    return () => {
      live = false
    }
  }, [base])

  async function toggle(emoji: string) {
    const mine = reactions.find((r) => r.emoji === emoji && r.mine)
    // Optimistic — a reaction that waits for a round trip feels broken.
    setReactions((current) =>
      mine
        ? current.filter((r) => r.id !== mine.id)
        : [...current, { id: `pending-${emoji}`, emoji, name: 'You', avatar_url: null, mine: true }],
    )
    await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    })
    void load()
  }

  // Unique reactors, for the avatar stack.
  const faces = reactions.filter(
    (r, i, all) => all.findIndex((o) => o.name === r.name) === i,
  )

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {EMOJI.map((emoji) => {
          const forThis = reactions.filter((r) => r.emoji === emoji)
          const mine = forThis.some((r) => r.mine)
          return (
            <button
              key={emoji}
              onClick={() => toggle(emoji)}
              title={forThis.map((r) => r.name).join(', ')}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-all ${
                mine
                  ? 'border-white/70 bg-white/10 text-paper'
                  : 'border-edge text-paper-dim hover:border-edge-strong hover:bg-ink-hover'
              }`}
            >
              <span className="text-base leading-none">{emoji}</span>
              {forThis.length > 0 && <span className="text-xs tabular-nums">{forThis.length}</span>}
            </button>
          )
        })}
      </div>

      {faces.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2">
          <div className="flex -space-x-2">
            {faces.slice(0, 6).map((r) => (
              <Avatar key={r.id} name={r.name} src={r.avatar_url} size={24} ring />
            ))}
          </div>
          <p className="text-xs text-paper-faint">
            {faces.length === 1
              ? faces[0].name
              : `${faces[0].name} and ${faces.length - 1} ${faces.length - 1 === 1 ? 'other' : 'others'}`}
          </p>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { warmDate } from '@/lib/format'
import { Avatar } from '@/components/Avatar'

interface CommentView {
  id: string
  body: string
  name: string
  avatar_url: string | null
  created_at: string
  mine: boolean
}

/**
 * Short notes under a memory or an event — the context a group chat loses by
 * Tuesday. Each is an avatar, a name, and the words. `subject` lets one
 * component serve both a media item and a board event.
 */
export function Comments({
  mediaId,
  collectionId,
}: {
  mediaId?: string
  collectionId?: string
}) {
  const base = mediaId ? `/api/media/${mediaId}/comments` : `/api/collections/${collectionId}/comments`
  const [comments, setComments] = useState<CommentView[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void (async () => {
      const response = await fetch(base)
      if (response.ok) {
        const data = (await response.json()) as { comments: CommentView[] }
        setComments(data.comments)
      }
    })()
  }, [base])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return

    setSending(true)
    try {
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      if (response.ok) {
        const data = (await response.json()) as { comment: CommentView }
        setComments((current) => [...current, data.comment])
        setDraft('')
        if (box.current) box.current.style.height = 'auto'
      }
    } finally {
      setSending(false)
    }
  }

  async function remove(id: string) {
    setComments((current) => current.filter((c) => c.id !== id))
    await fetch(`${base}?comment=${id}`, { method: 'DELETE' })
  }

  return (
    <section>
      <h3 className="eyebrow mb-4">Notes</h3>

      {comments.length > 0 && (
        <ul className="mb-5 space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="group flex gap-3">
              <Avatar name={comment.name} src={comment.avatar_url} size={32} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2.5">
                  <p className="text-sm font-medium text-paper">{comment.name}</p>
                  <p className="text-xs text-paper-faint">{warmDate(comment.created_at)}</p>
                  {comment.mine && (
                    <button
                      onClick={() => remove(comment.id)}
                      className="ml-auto text-xs text-paper-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-paper"
                    >
                      remove
                    </button>
                  )}
                </div>
                <p className="mt-0.5 leading-relaxed whitespace-pre-wrap text-paper-soft">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit}>
        <textarea
          ref={box}
          rows={1}
          value={draft}
          placeholder={comments.length ? 'Add a note…' : 'Say something about this…'}
          onChange={(event) => {
            setDraft(event.target.value)
            event.target.style.height = 'auto'
            event.target.style.height = `${event.target.scrollHeight}px`
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event)
          }}
          className="field resize-none"
        />
        {draft.trim() && (
          <button type="submit" disabled={sending} className="btn btn-primary mt-3">
            {sending ? 'Posting…' : 'Post'}
          </button>
        )}
      </form>
    </section>
  )
}

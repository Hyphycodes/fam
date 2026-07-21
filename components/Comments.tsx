'use client'

import { useEffect, useRef, useState } from 'react'
import { warmDate } from '@/lib/format'

interface Comment {
  id: string
  body: string
  user_id: string
  name: string
  created_at: string
}

/** Short notes under a memory. The context a group chat loses by Tuesday. */
export function Comments({ mediaId, userId }: { mediaId: string; userId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/media/${mediaId}/comments`)
      if (response.ok) {
        const data = (await response.json()) as { comments: Comment[] }
        setComments(data.comments)
      }
    })()
  }, [mediaId])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return

    setSending(true)
    try {
      const response = await fetch(`/api/media/${mediaId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      if (response.ok) {
        const data = (await response.json()) as { comment: Comment }
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
    await fetch(`/api/media/${mediaId}/comments?comment=${id}`, { method: 'DELETE' })
  }

  return (
    <section>
      <h3 className="mb-4 text-xs tracking-[0.2em] text-paper-faint uppercase">Notes</h3>

      {comments.length > 0 && (
        <ul className="mb-5 space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="group">
              <div className="flex items-baseline gap-2.5">
                <p className="font-display text-lg text-paper">{comment.name}</p>
                <p className="text-xs text-paper-faint">{warmDate(comment.created_at)}</p>
                {comment.user_id === userId && (
                  <button
                    onClick={() => remove(comment.id)}
                    className="ml-auto text-xs text-paper-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ember-soft"
                  >
                    remove
                  </button>
                )}
              </div>
              <p className="mt-1 leading-relaxed whitespace-pre-wrap text-paper-soft">
                {comment.body}
              </p>
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
            // Grow with the text instead of a scrollbar in a 1-line box.
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

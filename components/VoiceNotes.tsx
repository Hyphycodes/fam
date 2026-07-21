'use client'

import { useEffect, useRef, useState } from 'react'
import { duration as formatDuration, warmDate } from '@/lib/format'

/**
 * Voice notes — the part that outlives everything else here.
 *
 * Grandma taps a photo and says who everyone was. That's the whole feature, and
 * it's why the record button is the biggest thing on the panel.
 */

interface Note {
  id: string
  name: string
  url: string
  duration_seconds: number | null
  created_at: string
}

/** Chrome speaks webm, Safari speaks mp4. Ask before assuming. */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function VoiceNotes({ mediaId }: { mediaId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAt = useRef(0)

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/media/${mediaId}/voice`)
      if (response.ok) {
        const data = (await response.json()) as { notes: Note[] }
        setNotes(data.notes)
      }
    })()
  }, [mediaId])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - startedAt.current) / 1000)
    }, 200)
    return () => window.clearInterval(timer)
  }, [recording])

  async function start() {
    setError(null)
    const mimeType = pickMimeType()
    if (!mimeType) {
      setError('This browser cannot record audio. Safari or Chrome will work.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      // Stamped here rather than in the click handler so the clock starts when
      // the mic actually opens, not when permission was requested.
      recorder.onstart = () => {
        startedAt.current = Date.now()
      }
      recorder.onstop = () => {
        // Always release the mic, or the browser keeps showing "recording".
        for (const track of stream.getTracks()) track.stop()
        void upload(new Blob(chunksRef.current, { type: mimeType }), mimeType)
      }

      recorderRef.current = recorder
      setElapsed(0)
      recorder.start()
      setRecording(true)
    } catch {
      setError('We could not reach the microphone. Check the permission and try again.')
    }
  }

  function stop() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  async function upload(blob: Blob, mimeType: string) {
    setBusy(true)
    try {
      const seconds = (Date.now() - startedAt.current) / 1000

      const presign = await fetch(`/api/media/${mediaId}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: mimeType }),
      })
      if (!presign.ok) throw new Error('presign')
      const { key, putUrl } = (await presign.json()) as { key: string; putUrl: string }

      const put = await fetch(putUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': mimeType },
      })
      if (!put.ok) throw new Error('put')

      const save = await fetch(`/api/media/${mediaId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, durationSeconds: seconds, contentType: mimeType }),
      })
      if (!save.ok) throw new Error('save')

      const { note } = (await save.json()) as { note: Note }
      setNotes((current) => [...current, note])
    } catch {
      setError('That recording did not save. Try once more?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="mb-4 text-xs tracking-[0.2em] text-paper-faint uppercase">Voices</h3>

      {notes.length > 0 && (
        <ul className="mb-5 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="card p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="font-display text-lg">{note.name}</p>
                <p className="text-xs text-paper-faint">
                  {formatDuration(note.duration_seconds)} · {warmDate(note.created_at)}
                </p>
              </div>
              <audio controls preload="none" src={note.url} className="w-full" />
            </li>
          ))}
        </ul>
      )}

      {recording ? (
        <button onClick={stop} className="btn btn-primary w-full py-3.5">
          <span className="mr-1 inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-ink" />
          Stop — {formatDuration(elapsed) || '0:00'}
        </button>
      ) : (
        <button onClick={start} disabled={busy} className="btn btn-ghost w-full py-3.5">
          {busy ? 'Saving…' : notes.length ? 'Add another voice note' : 'Record a voice note'}
        </button>
      )}

      {!recording && !busy && notes.length === 0 && (
        <p className="mt-3 text-sm leading-relaxed text-paper-faint">
          Say who&rsquo;s in it, where it was, what happened next. It stays attached to this
          memory for good.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-ember-soft">{error}</p>}
    </section>
  )
}

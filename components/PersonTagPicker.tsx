'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import type { TagSuggestion } from '@/app/api/community/tag-suggestions/route'

export interface TagChip {
  name: string
  memberId: string | null
  profileId: string | null
  avatarUrl: string | null
}

// Fetched once per page load and shared by every picker on the screen — the
// family list doesn't change mid-session, and refetching per tile would be
// wasteful on a page with a dozen tag pickers open at once.
let cache: Promise<TagSuggestion[]> | null = null
function loadSuggestions(): Promise<TagSuggestion[]> {
  if (!cache) {
    cache = fetch('/api/community/tag-suggestions')
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((data: { suggestions: TagSuggestion[] }) => data.suggestions)
      .catch(() => [])
  }
  return cache
}

/**
 * "Who's in it" — type to search the family + previously-tagged names, tap to
 * add a chip. Falls through to free-text only when nothing matches, for the
 * grandparent or family friend who has no account.
 */
export function PersonTagPicker({
  value,
  onChange,
  placeholder = "Who's in it?",
}: {
  value: TagChip[]
  onChange: (next: TagChip[]) => void
  placeholder?: string
}) {
  const [pool, setPool] = useState<TagSuggestion[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    void loadSuggestions().then((suggestions) => {
      if (live) setPool(suggestions)
    })
    return () => {
      live = false
    }
  }, [])

  // Close the dropdown on an outside tap — the usual combobox contract.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const taken = useMemo(() => new Set(value.map(tagIdentity)), [value])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return pool
      .filter(
        (suggestion) =>
          !taken.has(tagIdentity(suggestion)) && suggestion.name.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [pool, query, taken])

  const exactMatch = matches.some((m) => m.name.toLowerCase() === query.trim().toLowerCase())
  const canAddFreeText =
    query.trim().length > 0 && !exactMatch && !taken.has(`name:${query.trim().toLowerCase()}`)
  const options: (TagSuggestion | 'free-text')[] = canAddFreeText
    ? [...matches, 'free-text']
    : matches

  function addChip(chip: TagChip) {
    if (taken.has(tagIdentity(chip))) return
    onChange([...value, chip])
    setQuery('')
    setHighlight(0)
    setOpen(false)
  }

  function removeChip(identity: string) {
    onChange(value.filter((chip) => tagIdentity(chip) !== identity))
  }

  function commitHighlighted() {
    const picked = options[highlight]
    if (!picked) return
    if (picked === 'free-text') {
      addChip({ name: query.trim(), memberId: null, profileId: null, avatarUrl: null })
    } else {
      addChip({
        name: picked.name,
        memberId: picked.memberId,
        profileId: picked.profileId,
        avatarUrl: picked.avatarUrl,
      })
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="field flex flex-wrap items-center gap-1.5 py-2">
        {value.map((chip) => (
          <span
            key={tagIdentity(chip)}
            className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-1 pl-1.5 text-sm text-paper"
          >
            <Avatar name={chip.name} src={chip.avatarUrl} size={18} />
            {chip.name}
            <button
              type="button"
              onClick={() => removeChip(tagIdentity(chip))}
              aria-label={`Remove ${chip.name}`}
              className="grid h-4 w-4 place-items-center rounded-full text-paper-faint hover:bg-white/10 hover:text-paper"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setHighlight((h) => Math.min(h + 1, options.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlight((h) => Math.max(h - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              if (options.length > 0) commitHighlighted()
            } else if (event.key === 'Backspace' && query === '' && value.length > 0) {
              removeChip(tagIdentity(value[value.length - 1]))
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder={value.length === 0 ? placeholder : 'Add another…'}
          className="min-w-[8rem] flex-1 bg-transparent py-1 outline-none placeholder:text-paper-faint"
        />
      </div>

      {open && options.length > 0 && (
        <ul className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-20 max-h-56 overflow-y-auto rounded-xl border border-edge-strong bg-ink-raised py-1 shadow-2xl animate-rise">
          {options.map((option, index) =>
            option === 'free-text' ? (
              <li key="free-text">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    addChip({
                      name: query.trim(),
                      memberId: null,
                      profileId: null,
                      avatarUrl: null,
                    })
                  }
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                    index === highlight ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-dashed border-edge-strong text-xs text-paper-faint">
                    +
                  </span>
                  <span className="text-paper-soft">
                    Add &ldquo;<span className="text-paper">{query.trim()}</span>&rdquo;
                  </span>
                </button>
              </li>
            ) : (
              <li key={tagIdentity(option)}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    addChip({
                      name: option.name,
                      memberId: option.memberId,
                      profileId: option.profileId,
                      avatarUrl: option.avatarUrl,
                    })
                  }
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                    index === highlight ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <Avatar name={option.name} src={option.avatarUrl} size={22} />
                  <span className="text-paper">{option.name}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function tagIdentity(tag: { name: string; memberId: string | null; profileId: string | null }) {
  if (tag.memberId) return `member:${tag.memberId}`
  if (tag.profileId) return `profile:${tag.profileId}`
  return `name:${tag.name.toLowerCase()}`
}

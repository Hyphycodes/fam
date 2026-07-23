'use client'

import { useEffect, useRef, useState } from 'react'
import { anchorCapturedAt, type CapturePrecision } from '@/lib/format'

/**
 * Picking *when* a memory happened, at whatever precision you actually know.
 *
 * The input adapts to the precision so it can never ask for a day you don't have
 * and then invent one: Year is a single year field, Month is month-and-year,
 * Day is a date, Exact is date-and-time. The chosen date is anchored to the
 * middle of its span (`anchorCapturedAt`) so a year-only memory sorts mid-year
 * instead of pretending to be January 1st.
 *
 * Shared by the single-item editor and the bulk "Set date" sheet so both speak
 * exactly the same language.
 */

const PRECISIONS: { value: CapturePrecision; label: string }[] = [
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'day', label: 'Day' },
  { value: 'exact', label: 'Exact' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const toDayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toMonthStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const toExactStr = (d: Date) => `${toDayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

function computeTakenAt(
  precision: CapturePrecision,
  parts: { yearStr: string; monthStr: string; dayStr: string; exactStr: string },
): string | null {
  const num = (value: string) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : NaN
  }
  if (precision === 'year') {
    const year = num(parts.yearStr)
    if (!year || year < 1800 || year > 3000) return null
    return anchorCapturedAt('year', { year }).toISOString()
  }
  if (precision === 'month') {
    const [year, month] = parts.monthStr.split('-').map(num)
    if (!year || !month) return null
    return anchorCapturedAt('month', { year, month: month - 1 }).toISOString()
  }
  if (precision === 'day') {
    const [year, month, day] = parts.dayStr.split('-').map(num)
    if (!year || !month || !day) return null
    return anchorCapturedAt('day', { year, month: month - 1, day }).toISOString()
  }
  const [datePart, timePart] = parts.exactStr.split('T')
  if (!datePart) return null
  const [year, month, day] = datePart.split('-').map(num)
  if (!year || !month || !day) return null
  const [hour, minute] = (timePart ?? '12:00').split(':').map(num)
  return anchorCapturedAt('exact', {
    year,
    month: month - 1,
    day,
    hour: Number.isFinite(hour) ? hour : 12,
    minute: Number.isFinite(minute) ? minute : 0,
  }).toISOString()
}

export interface CaptureDateValue {
  precision: CapturePrecision
  takenAt: string | null
}

export function CaptureDateFields({
  initialTakenAt,
  initialPrecision = 'day',
  onChange,
  idPrefix = 'capture',
}: {
  initialTakenAt?: string | null
  initialPrecision?: CapturePrecision
  onChange: (value: CaptureDateValue) => void
  idPrefix?: string
}) {
  const base = initialTakenAt ? new Date(initialTakenAt) : null
  const valid = base && !Number.isNaN(base.getTime()) ? base : null

  const [precision, setPrecision] = useState<CapturePrecision>(initialPrecision)
  const [yearStr, setYearStr] = useState(valid ? String(valid.getFullYear()) : '')
  const [monthStr, setMonthStr] = useState(valid ? toMonthStr(valid) : '')
  const [dayStr, setDayStr] = useState(valid ? toDayStr(valid) : '')
  const [exactStr, setExactStr] = useState(valid ? toExactStr(valid) : '')

  // Keep the latest onChange in a ref (updated in an effect, not during render)
  // so emitting on input changes never depends on the parent passing a stable
  // callback, and never loops.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    onChangeRef.current({
      precision,
      takenAt: computeTakenAt(precision, { yearStr, monthStr, dayStr, exactStr }),
    })
  }, [precision, yearStr, monthStr, dayStr, exactStr])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date precision">
        {PRECISIONS.map((option) => {
          const active = option.value === precision
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setPrecision(option.value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                active
                  ? 'border-white/70 bg-white/10 text-paper'
                  : 'border-edge text-paper-dim hover:bg-ink-hover'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {precision === 'year' && (
        <input
          type="number"
          inputMode="numeric"
          min={1800}
          max={3000}
          value={yearStr}
          onChange={(event) => setYearStr(event.target.value)}
          placeholder="1998"
          aria-label="Year"
          id={`${idPrefix}-year`}
          className="field tracking-normal normal-case"
        />
      )}
      {precision === 'month' && (
        <input
          type="month"
          value={monthStr}
          onChange={(event) => setMonthStr(event.target.value)}
          aria-label="Month and year"
          id={`${idPrefix}-month`}
          className="field tracking-normal normal-case"
        />
      )}
      {precision === 'day' && (
        <input
          type="date"
          value={dayStr}
          onChange={(event) => setDayStr(event.target.value)}
          aria-label="Date"
          id={`${idPrefix}-day`}
          className="field tracking-normal normal-case"
        />
      )}
      {precision === 'exact' && (
        <input
          type="datetime-local"
          value={exactStr}
          onChange={(event) => setExactStr(event.target.value)}
          aria-label="Date and time"
          id={`${idPrefix}-exact`}
          className="field tracking-normal normal-case"
        />
      )}
    </div>
  )
}

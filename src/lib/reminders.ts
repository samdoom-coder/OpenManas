// Due-date reminder helpers for the Calendar view (reminders hub).
// Pure + framework-free so they are unit-testable (see tests/calendar.test.ts).
// Date values are the same strings the `date` property stores (YYYY-MM-DD from
// <input type="date">, or ISO datetimes) — dayKey() normalizes to local YYYY-MM-DD.

import type { Database, DatabaseRecord } from '@/lib/types'
import { isDoneValue } from '@/lib/automation'

export type DueUrgency = 'overdue' | 'today' | 'soon' | 'later' | 'none'

/** Local YYYY-MM-DD for a Date (avoids toISOString UTC-shift bugs). */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's local day key. Takes an optional now for tests. */
export function todayKey(now: Date = new Date()): string {
  return dayKey(now)
}

/**
 * Normalize a stored date value to a local day key.
 * Returns undefined for empty/unparseable values (never throws).
 */
export function parseDueDate(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const s = String(value).trim()
  if (!s) return undefined
  // Fast path: already YYYY-MM-DD (optionally with time suffix).
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return undefined
  return dayKey(d)
}

/** First `date` property — the semantic due-date column. */
export function findDateProp(database: Database): string | undefined {
  return database.properties.find((p) => p.type === 'date')?.id
}

/**
 * First completable property: checkbox wins, else a status/select that
 * actually has a "Done" option (so toggling can never corrupt custom flows).
 */
export function findDoneProp(database: Database): string | undefined {
  const checkbox = database.properties.find((p) => p.type === 'checkbox')?.id
  if (checkbox) return checkbox
  const status = database.properties.find(
    (p) =>
      (p.type === 'status' || p.type === 'select') &&
      (p.options ?? []).some((o) => isDoneValue(o)),
  )?.id
  return status
}

/** True when the record is completed via the database's done property. */
export function isRecordDone(record: DatabaseRecord, database: Database): boolean {
  const doneProp = findDoneProp(database)
  if (!doneProp) return false
  const prop = database.properties.find((p) => p.id === doneProp)
  const v = record.properties[doneProp]
  if (prop?.type === 'checkbox') return v === true
  return isDoneValue(v)
}

/**
 * Urgency of a record relative to a day key (default: today).
 * Done records and records without a parseable date are 'none'/'done-safe'.
 */
export function dueStatus(
  record: DatabaseRecord,
  database: Database,
  ref: string = todayKey(),
  datePropId?: string,
): DueUrgency {
  const dateProp = datePropId ?? findDateProp(database)
  if (!dateProp) return 'none'
  const due = parseDueDate(record.properties[dateProp])
  if (!due) return 'none'
  if (isRecordDone(record, database)) return 'none'
  if (due < ref) return 'overdue'
  if (due === ref) return 'today'
  // 'soon' = within the next 7 days (lexicographic compare works on YYYY-MM-DD).
  const refDate = new Date(`${ref}T00:00:00`)
  const dueDate = new Date(`${due}T00:00:00`)
  const diffDays = Math.round((dueDate.getTime() - refDate.getTime()) / 86_400_000)
  if (diffDays >= 0 && diffDays <= 7) return 'soon'
  return 'later'
}

export interface ReminderGroups {
  overdue: DatabaseRecord[]
  today: DatabaseRecord[]
  upcoming: DatabaseRecord[] // due in the next 7 days (excl. today)
}

function byDueThenTitle(a: DatabaseRecord, b: DatabaseRecord, dateProp: string): number {
  const da = parseDueDate(a.properties[dateProp]) ?? ''
  const db = parseDueDate(b.properties[dateProp]) ?? ''
  if (da !== db) return da < db ? -1 : 1
  return a.id.localeCompare(b.id)
}

/**
 * Split dated, not-done records into reminder buckets.
 * Done records and records without dates are excluded (they are not reminders).
 */
export function groupReminders(
  records: DatabaseRecord[],
  database: Database,
  ref: string = todayKey(),
): ReminderGroups {
  const dateProp = findDateProp(database)
  const out: ReminderGroups = { overdue: [], today: [], upcoming: [] }
  if (!dateProp) return out
  for (const r of records) {
    const s = dueStatus(r, database, ref, dateProp)
    if (s === 'overdue') out.overdue.push(r)
    else if (s === 'today') out.today.push(r)
    else if (s === 'soon') out.upcoming.push(r)
  }
  const sort = (x: DatabaseRecord, y: DatabaseRecord) => byDueThenTitle(x, y, dateProp)
  out.overdue.sort(sort)
  out.today.sort(sort)
  out.upcoming.sort(sort)
  return out
}

/** Whole-day difference: positive = days remaining, negative = days overdue. */
export function daysUntil(dueDayKey: string, ref: string = todayKey()): number {
  const a = new Date(`${ref}T00:00:00`).getTime()
  const b = new Date(`${dueDayKey}T00:00:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function dueLabelFor(dueDayKey: string, ref: string = todayKey()): string {
  const n = daysUntil(dueDayKey, ref)
  if (n < 0) return n === -1 ? 'due yesterday' : `due ${-n} days ago`
  if (n === 0) return 'due today'
  if (n === 1) return 'due tomorrow'
  return `due in ${n} days`
}

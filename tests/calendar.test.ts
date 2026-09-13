import { describe, it, expect } from 'vitest'
import {
  dayKey, todayKey, parseDueDate, findDateProp, findDoneProp,
  isRecordDone, dueStatus, groupReminders, daysUntil, dueLabelFor,
} from '../src/lib/reminders'
import { buildNotificationsForEvent } from '../src/lib/automation'

const db = {
  id: 'db1',
  properties: [
    { id: 'p_title', name: 'Task', type: 'text' },
    { id: 'p_due', name: 'Due', type: 'date' },
    { id: 'p_status', name: 'Status', type: 'status', options: ['Todo', 'Doing', 'Done'] },
  ],
} as any

const rec = (id: string, due?: string, status?: string) =>
  ({ id, databaseId: 'db1', properties: { p_title: id, ...(due ? { p_due: due } : {}), ...(status ? { p_status: status } : {}) } }) as any

describe('dayKey / parseDueDate', () => {
  it('formats local day keys without UTC shift', () => {
    expect(dayKey(new Date(2026, 8, 13))).toBe('2026-09-13')
  })
  it('todayKey matches dayKey(new Date())', () => {
    expect(todayKey()).toBe(dayKey(new Date()))
  })
  it('parses YYYY-MM-DD and ISO datetimes, rejects junk', () => {
    expect(parseDueDate('2026-09-13')).toBe('2026-09-13')
    expect(parseDueDate('2026-09-13T15:00:00.000Z')).toBe('2026-09-13')
    expect(parseDueDate('')).toBeUndefined()
    expect(parseDueDate(undefined)).toBeUndefined()
    expect(parseDueDate('not a date')).toBeUndefined()
  })
})

describe('done detection', () => {
  it('finds date + status-done props', () => {
    expect(findDateProp(db)).toBe('p_due')
    expect(findDoneProp(db)).toBe('p_status')
  })
  it('prefers checkbox over status', () => {
    const withCheck = { properties: [...db.properties, { id: 'p_c', name: 'C', type: 'checkbox' }] } as any
    expect(findDoneProp(withCheck)).toBe('p_c')
  })
  it('ignores status props without a Done option', () => {
    const noDone = { properties: [{ id: 's', name: 'S', type: 'status', options: ['A', 'B'] }] } as any
    expect(findDoneProp(noDone)).toBeUndefined()
  })
  it('isRecordDone is case-insensitive on Done', () => {
    expect(isRecordDone(rec('a', '2026-09-13', 'Done'), db)).toBe(true)
    expect(isRecordDone(rec('a', '2026-09-13', 'done'), db)).toBe(true)
    expect(isRecordDone(rec('a', '2026-09-13', 'Doing'), db)).toBe(false)
    expect(isRecordDone(rec('a', '2026-09-13'), db)).toBe(false)
  })
})

describe('dueStatus / groupReminders', () => {
  const REF = '2026-09-13'
  it('classifies overdue / today / soon / later / none', () => {
    expect(dueStatus(rec('o', '2026-09-10', 'Todo'), db, REF)).toBe('overdue')
    expect(dueStatus(rec('t', '2026-09-13', 'Todo'), db, REF)).toBe('today')
    expect(dueStatus(rec('s', '2026-09-15', 'Todo'), db, REF)).toBe('soon')
    expect(dueStatus(rec('l', '2026-10-20', 'Todo'), db, REF)).toBe('later')
    expect(dueStatus(rec('d', '2026-09-10', 'Done'), db, REF)).toBe('none')
    expect(dueStatus(rec('n'), db, REF)).toBe('none')
  })
  it('groups exclude done + undated, sorted by due date', () => {
    const g = groupReminders([
      rec('b', '2026-09-12', 'Todo'),
      rec('a', '2026-09-10', 'Todo'),
      rec('t', '2026-09-13', 'Todo'),
      rec('u', '2026-09-16', 'Doing'),
      rec('done', '2026-09-01', 'Done'),
      rec('nodate'),
    ], db, REF)
    expect(g.overdue.map(r => r.id)).toEqual(['a', 'b'])
    expect(g.today.map(r => r.id)).toEqual(['t'])
    expect(g.upcoming.map(r => r.id)).toEqual(['u'])
  })
  it('empty without a date property', () => {
    const g = groupReminders([rec('a', '2026-09-10', 'Todo')], { properties: [] } as any, REF)
    expect(g).toEqual({ overdue: [], today: [], upcoming: [] })
  })
})

describe('due labels', () => {
  it('daysUntil + dueLabelFor read naturally', () => {
    expect(daysUntil('2026-09-12', '2026-09-13')).toBe(-1)
    expect(dueLabelFor('2026-09-12', '2026-09-13')).toBe('due yesterday')
    expect(dueLabelFor('2026-09-13', '2026-09-13')).toBe('due today')
    expect(dueLabelFor('2026-09-14', '2026-09-13')).toBe('due tomorrow')
    expect(dueLabelFor('2026-09-20', '2026-09-13')).toBe('due in 7 days')
  })
})

describe('due_reminder automation', () => {
  it('builds an inbox draft with a deep link', () => {
    const drafts = buildNotificationsForEvent(
      { type: 'due_reminder', actorId: 'u1', databaseId: 'db1', recordId: 'r1', title: 'Pay rent', dueLabel: 'due today' },
      { mentions: true, comments: true, shares: true, tasks: true },
      undefined,
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0].link).toBe('database:db1/record:r1')
    expect(drafts[0].title).toContain('Pay rent')
  })
  it('respects Tasks pref off', () => {
    const drafts = buildNotificationsForEvent(
      { type: 'due_reminder', actorId: 'u1', databaseId: 'db1', recordId: 'r1', title: 'Pay rent', dueLabel: 'due today' },
      { mentions: true, comments: true, shares: true, tasks: false },
      undefined,
    )
    expect(drafts).toHaveLength(0)
  })
})

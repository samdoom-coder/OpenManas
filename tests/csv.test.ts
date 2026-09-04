import { describe, it, expect } from 'vitest'
import {
  escapeCsvCell,
  parseCsv,
  recordsToCsv,
  mapCsvToRecords,
  parseCsvCell,
  valueToCsvCell,
} from '../src/lib/csvUtils'

const db: any = {
  name: 'Tasks',
  properties: [
    { id: 'p_name', name: 'Name', type: 'text' },
    { id: 'p_status', name: 'Status', type: 'status', options: ['Todo', 'Done'] },
    { id: 'p_tags', name: 'Tags', type: 'multi_select' },
    { id: 'p_done', name: 'Done', type: 'checkbox' },
    { id: 'p_n', name: 'Count', type: 'number' },
  ],
}

describe('csvUtils', () => {
  it('escapes cells', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('plain')).toBe('plain')
  })

  it('round-trips records through csv', () => {
    const records: any[] = [
      { id: 'r1', databaseId: 'd', properties: { p_name: 'Hello, world', p_status: 'Todo', p_tags: ['a', 'b'], p_done: true, p_n: 3 }, position: 0, createdBy: 'u', createdAt: '', updatedAt: '' },
    ]
    const csv = recordsToCsv(db, records)
    expect(csv.split('\n')[0]).toBe('Name,Status,Tags,Done,Count')
    const parsed = parseCsv(csv)
    expect(parsed.headers).toEqual(['Name', 'Status', 'Tags', 'Done', 'Count'])
    const mapped = mapCsvToRecords(db, parsed)
    expect(mapped.matched).toContain('Name')
    expect(mapped.records[0].p_name).toBe('Hello, world')
    expect(mapped.records[0].p_tags).toEqual(['a', 'b'])
    expect(mapped.records[0].p_done).toBe(true)
    expect(mapped.records[0].p_n).toBe(3)
  })

  it('parses quoted csv with commas + newlines', () => {
    const parsed = parseCsv('Name,Note\n"a,b","line1\nline2"\nc,d')
    expect(parsed.rows[0]).toEqual(['a,b', 'line1\nline2'])
    expect(parsed.rows[1]).toEqual(['c', 'd'])
  })

  it('matches headers case-insensitively + ignores unknown columns', () => {
    const mapped = mapCsvToRecords(db, { headers: ['name', 'Nope'], rows: [['Task 1', 'x']] })
    expect(mapped.matched).toEqual(['name'])
    expect(mapped.unmatched).toEqual(['Nope'])
    expect(mapped.records[0].p_name).toBe('Task 1')
  })

  it('coerces checkbox/number/multi values', () => {
    expect(parseCsvCell({ id: 'x', name: 'D', type: 'checkbox' } as any, 'yes')).toBe(true)
    expect(parseCsvCell({ id: 'x', name: 'D', type: 'checkbox' } as any, '0')).toBe(false)
    expect(parseCsvCell({ id: 'x', name: 'N', type: 'number' } as any, '42')).toBe(42)
    expect(valueToCsvCell({ id: 'x', name: 'T', type: 'multi_select' } as any, ['a', 'b'])).toBe('a;b')
  })
})

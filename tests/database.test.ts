import { describe, it, expect } from 'vitest'
import { paginate, pageCount, evaluateFormula, evaluateRollup } from '../src/lib/databaseEngine'

describe('pagination (Postgres LIMIT/OFFSET mirror)', () => {
  const items = Array.from({ length: 95 }, (_, i) => i + 1)
  it('pages slices', () => {
    expect(paginate(items, 1, 50)).toHaveLength(50)
    expect(paginate(items, 2, 50)).toHaveLength(45)
    expect(paginate(items, 1, 50)[0]).toBe(1)
    expect(paginate(items, 2, 50)[0]).toBe(51)
  })
  it('clamps bad input', () => {
    expect(paginate(items, 0, 50)).toHaveLength(50)
    expect(paginate(items, 1, 0)).toHaveLength(25)
    expect(pageCount(95, 50)).toBe(2)
    expect(pageCount(0, 50)).toBe(1)
  })
})

describe('formula evaluation', () => {
  const db = {
    properties: [
      { id: 'p_price', name: 'Price', type: 'text' },
      { id: 'p_qty', name: 'Qty', type: 'number' },
      { id: 'p_total', name: 'Price * Qty', type: 'formula' },
    ],
  } as any
  const record = { properties: { p_price: 10, p_qty: 3 } } as any
  it('multiplies referenced props', () => {
    expect(evaluateFormula(db.properties[2], { database: db, record, allRecords: [] })).toBe(30)
  })
  it('returns null on non-numeric', () => {
    const bad = { properties: { p_price: 'abc', p_qty: 3 } } as any
    expect(evaluateFormula(db.properties[2], { database: db, record: bad, allRecords: [] })).toBeNull()
  })
  it('supports Total = Price * Qty syntax', () => {
    const named = { ...db.properties[2], name: 'Total = Price * Qty' } as any
    expect(evaluateFormula(named, { database: db, record, allRecords: [] })).toBe(30)
  })
})

describe('rollup evaluation', () => {
  const tasksDb = 'db_tasks'
  const projectsDb = 'db_projects'
  const database = {
    properties: [
      { id: 'pj_name', name: 'Project', type: 'text' },
      { id: 'p_rel', name: 'Project', type: 'relation', relationDatabaseId: tasksDb },
    ],
  } as any
  const allRecords = [
    { id: 't1', databaseId: tasksDb, properties: { p_rel: 'Website Redesign', amount: 10 } },
    { id: 't2', databaseId: tasksDb, properties: { p_rel: 'Website Redesign', amount: 20 } },
    { id: 't3', databaseId: tasksDb, properties: { p_rel: 'Mobile App', amount: 5 } },
  ] as any
  const site = { id: 'p1', databaseId: projectsDb, properties: { pj_name: 'Website Redesign' } } as any
  it('counts related', () => {
    const prop = { id: 'r1', name: 'Count', type: 'rollup', relationDatabaseId: tasksDb } as any
    expect(evaluateRollup(prop, { database, record: site, allRecords })).toBe(2)
  })
  it('sums numeric field', () => {
    const prop = { id: 'r2', name: 'Sum:amount', type: 'rollup', relationDatabaseId: tasksDb } as any
    expect(evaluateRollup(prop, { database, record: site, allRecords })).toBe(30)
  })
  it('returns null without relation target', () => {
    const prop = { id: 'r3', name: 'Count', type: 'rollup' } as any
    expect(evaluateRollup(prop, { database, record: site, allRecords })).toBeNull()
  })
})

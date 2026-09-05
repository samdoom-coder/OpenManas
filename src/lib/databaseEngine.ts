import type { DatabaseRecord, DatabaseProperty, FilterGroup, FilterCondition } from './types'

export function evaluateFilter(record: DatabaseRecord, filter?: FilterGroup): boolean {
  if (!filter || filter.conditions.length === 0) return true
  const results = filter.conditions.map(c => {
    if ('op' in c) return evaluateFilter(record, c as FilterGroup)
    return evaluateCondition(record, c as FilterCondition)
  })
  if (filter.op === 'and') return results.every(Boolean)
  if (filter.op === 'or') return results.some(Boolean)
  if (filter.op === 'not') return !results[0]
  return true
}

function evaluateCondition(record: DatabaseRecord, cond: FilterCondition): boolean {
  const val = record.properties[cond.propertyId]
  const target = cond.value
  switch (cond.operator) {
    case 'equals': return val === target
    case 'not_equals': return val !== target
    case 'contains': return String(val ?? '').toLowerCase().includes(String(target).toLowerCase())
    case 'not_contains': return !String(val ?? '').toLowerCase().includes(String(target).toLowerCase())
    case 'gt': return Number(val) > Number(target)
    case 'lt': return Number(val) < Number(target)
    case 'is_empty': return val === undefined || val === null || val === ''
    case 'is_not_empty': return val !== undefined && val !== null && val !== ''
    case 'before': return new Date(String(val)) < new Date(String(target))
    case 'after': return new Date(String(val)) > new Date(String(target))
    default: return true
  }
}

export function sortRecords(records: DatabaseRecord[], sort?: { propertyId: string, direction: 'asc' | 'desc' }[]): DatabaseRecord[] {
  if (!sort || sort.length === 0) return records
  return [...records].sort((a,b) => {
    for (const s of sort) {
      const av = a.properties[s.propertyId]
      const bv = b.properties[s.propertyId]
      if (av === bv) continue
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
      return s.direction === 'asc' ? cmp : -cmp
    }
    return 0
  })
}

export function groupRecords(records: DatabaseRecord[], groupBy?: string): Record<string, DatabaseRecord[]> {
  if (!groupBy) return { 'All': records }
  const groups: Record<string, DatabaseRecord[]> = {}
  for (const r of records) {
    const key = String(r.properties[groupBy] ?? 'No value')
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }
  return groups
}

// Virtualization helper
// Postgres mapping: paginate() mirrors `LIMIT pageSize OFFSET (page-1)*pageSize`.
// Server should return `{ rows, total }` via `SELECT COUNT(*) OVER() ... LIMIT/OFFSET`
// with a stable ORDER BY (position, id) so pages don't skip/duplicate on writes.
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, Math.floor(page) || 1)
  const safeSize = Math.min(500, Math.max(1, Math.floor(pageSize) || 25))
  const start = (safePage - 1) * safeSize
  return items.slice(start, start + safeSize)
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
}

export function getPropertyValue(record: DatabaseRecord, prop: DatabaseProperty): string {
  const v = record.properties[prop.id]
  if (v === undefined || v === null) return ''
  if (prop.type === 'checkbox') return v ? 'Yes' : 'No'
  if (prop.type === 'multi_select' && Array.isArray(v)) return (v as string[]).join(', ')
  if (prop.type === 'date' || prop.type === 'created_time' || prop.type === 'updated_time') {
    try { return new Date(String(v)).toLocaleDateString() } catch { return String(v) }
  }
  return String(v)
}

// ---------------------------------------------------------------------------
// Derived columns (formula / rollup) — Postgres-portable by design.
// Local JSON evaluates in JS; Postgres should evaluate the same way via
// generated columns or a read-model (see migrations/002_db_performance.sql):
//   formula → SQL expression over properties->>'propId'
//   rollup  → SELECT count/sum/avg FROM database_records WHERE database_id = ...
// Gated by Settings `databases.rollupFormulas` so rollout is a switch.
// ---------------------------------------------------------------------------

export interface DerivedContext {
  database: { properties: DatabaseProperty[] }
  record: DatabaseRecord
  /** All records across all databases (for relation/rollup lookups). */
  allRecords: DatabaseRecord[]
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).trim().replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function propByName(properties: DatabaseProperty[], name: string): DatabaseProperty | undefined {
  const key = name.trim().toLowerCase()
  return properties.find(p => p.name.trim().toLowerCase() === key || p.id === name)
}

/**
 * Evaluate a formula property.
 * Convention: the property NAME holds the expression, referencing other
 * properties by name, e.g. name `Price * Qty` or `Total = Price * Qty`.
 * Supports + - * / ( ) and numeric literals. Unknown/non-numeric refs → null.
 */
export function evaluateFormula(
  prop: DatabaseProperty,
  ctx: DerivedContext,
): number | string | null {
  let expr = prop.name.trim()
  // allow `Total = Price * Qty` — use RHS
  if (expr.includes('=')) expr = expr.split('=').slice(1).join('=').trim()
  if (!expr) return null
  const { database, record } = ctx
  // tokenize identifiers vs operators
  const tokens = expr.match(/[A-Za-z_][A-Za-z0-9_ ]*|[0-9]*\.?[0-9]+|[+\-*/()]/g)
  if (!tokens) return null
  const resolved: string[] = []
  for (const t of tokens) {
    if (/^[+\-*/()]$/.test(t.trim()) || /^[0-9]*\.?[0-9]+$/.test(t.trim())) {
      resolved.push(t.trim())
      continue
    }
    const ref = propByName(database.properties, t.trim())
    if (!ref || ref.id === prop.id) return null
    const n = toNumber(record.properties[ref.id])
    if (n === null) return null
    resolved.push(String(n))
  }
  const js = resolved.join(' ')
  // safe eval: only numbers/operators/parens remain
  if (!/^[0-9.+\-*/() \s]+$/.test(js)) return null
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${js})`)
    const out = fn() as unknown
    return typeof out === 'number' && Number.isFinite(out) ? Math.round(out * 100) / 100 : null
  } catch {
    return null
  }
}

/**
 * Evaluate a rollup property.
 * Convention: property NAME declares the aggregation:
 *   `Count` / `Tasks` → count of related records
 *   `Sum:Price` / `Avg:Qty` → sum/avg of numeric field in related DB
 * Relation target = prop.relationDatabaseId, matched by the database's
 * first relation property pointing at that DB (title match, case-insensitive).
 * When no relation is configured, falls back to counting all records in the
 * relation DB (useful for `Projects → Tasks count`).
 */
export function evaluateRollup(
  prop: DatabaseProperty,
  ctx: DerivedContext,
): number | null {
  const { database, record, allRecords } = ctx
  const relDbId = prop.relationDatabaseId
  if (!relDbId) return null
  const name = prop.name.trim()
  const m = name.match(/^(sum|avg|count)\s*:?\s*(.*)$/i)
  const agg = (m?.[1] ?? 'count').toLowerCase() as 'sum' | 'avg' | 'count'
  const fieldName = (m?.[2] ?? '').trim()

  // find relation prop on THIS database that points at relDbId
  const relProp = database.properties.find(p => p.type === 'relation' && p.relationDatabaseId === relDbId)
  let candidates = allRecords.filter(r => r.databaseId === relDbId)
  if (relProp) {
    const titlePropId = database.properties[0]?.id
    const myTitle = titlePropId ? String(record.properties[titlePropId] ?? '').trim().toLowerCase() : ''
    if (myTitle) {
      candidates = candidates.filter(r => {
        const relVal = String(
          (r.properties[relProp.id] ?? Object.values(r.properties)[0] ?? ''),
        ).trim().toLowerCase()
        return relVal === myTitle || relVal.includes(myTitle) || myTitle.includes(relVal)
      })
    }
  }
  if (agg === 'count') return candidates.length
  // sum/avg need a numeric field in the RELATED database — resolve by name there
  if (!fieldName) return candidates.length
  // find field id by scanning candidate values: match caller's guess against keys is
  // impossible without related schema, so caller passes field via `fieldName` which we
  // match against the related record's first numeric-looking property.
  const nums: number[] = []
  for (const r of candidates) {
    // prefer exact key match (property id or raw name stored in properties)
    let raw: unknown = (r.properties as Record<string, unknown>)[fieldName]
    if (raw === undefined) {
      const entries = Object.entries(r.properties)
      const hit = entries.find(([k]) => k.trim().toLowerCase() === fieldName.toLowerCase())
      raw = hit?.[1]
    }
    if (raw === undefined) {
      // fallback: first numeric value in the record
      raw = Object.values(r.properties).map(toNumber).find(n => n !== null) ?? null
    }
    const n = toNumber(raw)
    if (n !== null) nums.push(n)
  }
  if (nums.length === 0) return 0
  if (agg === 'sum') return Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
}

/** Derived display for formula/rollup cells. Returns null when not computable. */
export function getDerivedValue(
  prop: DatabaseProperty,
  ctx: DerivedContext,
): number | string | null {
  if (prop.type === 'formula') return evaluateFormula(prop, ctx)
  if (prop.type === 'rollup') return evaluateRollup(prop, ctx)
  return null
}

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
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page-1)*pageSize
  return items.slice(start, start+pageSize)
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

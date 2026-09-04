import type { Database, DatabaseProperty, DatabaseRecord } from '@/lib/types'
import { coercePropertyValue, displayPropertyValue, propertyDefFor } from '@/lib/propertyDefs'

/** Escape one CSV cell per RFC 4180. */
export function escapeCsvCell(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Serialize a stored property value to a CSV-friendly string. */
export function valueToCsvCell(prop: DatabaseProperty, value: unknown, record?: DatabaseRecord): string {
  if (value === undefined || value === null) return ''
  if (prop.type === 'multi_select' && Array.isArray(value)) return (value as unknown[]).map(String).join(';')
  if (prop.type === 'checkbox') return value ? 'true' : 'false'
  if (prop.type === 'created_time' || prop.type === 'updated_time') {
    return displayPropertyValue(prop, value, record?.createdAt, record?.updatedAt)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function recordsToCsv(database: Database, records: DatabaseRecord[]): string {
  const header = database.properties.map(p => escapeCsvCell(p.name)).join(',')
  const lines = records.map(r =>
    database.properties.map(p => escapeCsvCell(valueToCsvCell(p, r.properties[p.id], r))).join(',')
  )
  return [header, ...lines].join('\n')
}

export function recordsToJson(database: Database, records: DatabaseRecord[]): string {
  const rows = records.map(r => {
    const obj: Record<string, unknown> = { _id: r.id }
    database.properties.forEach(p => {
      obj[p.name] = r.properties[p.id] ?? null
    })
    return obj
  })
  return JSON.stringify({ database: database.name, exportedAt: new Date().toISOString(), count: rows.length, rows }, null, 2)
}

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/** Minimal RFC 4180 parser: handles quoted cells, escaped quotes, commas + newlines inside quotes. */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const clean = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(cell)
        cell = ''
      } else if (c === '\n') {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      } else if (c === '\r') {
        // ignore, handled by \n
      } else {
        cell += c
      }
    }
  }
  // trailing cell
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // drop fully-empty rows
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }
  const headers = nonEmpty[0].map(h => h.trim())
  return { headers, rows: nonEmpty.slice(1) }
}

/** Parse one CSV cell back into the stored shape for a property type. */
export function parseCsvCell(prop: DatabaseProperty, raw: string): unknown {
  const v = raw.trim()
  if (v === '') return propertyDefFor(prop.type).defaultValue(prop)
  switch (prop.type) {
    case 'checkbox': {
      const low = v.toLowerCase()
      if (['true', 'yes', 'y', '1', 'checked', 'done'].includes(low)) return true
      if (['false', 'no', 'n', '0', 'unchecked', ''].includes(low)) return false
      return coercePropertyValue(prop, v)
    }
    case 'multi_select':
      return v.split(';').map(s => s.trim()).filter(Boolean)
    case 'number': {
      const n = Number(v)
      return Number.isNaN(n) ? v : n
    }
    default:
      return coercePropertyValue(prop, v)
  }
}

/**
 * Map parsed CSV rows to record property bags.
 * Matches CSV headers to properties by name (case-insensitive).
 * Unmatched columns are ignored; missing properties get defaults.
 */
export function mapCsvToRecords(
  database: Database,
  parsed: ParsedCsv,
): { records: Record<string, unknown>[]; matched: string[]; unmatched: string[] } {
  const byName = new Map<string, DatabaseProperty>()
  database.properties.forEach(p => byName.set(p.name.trim().toLowerCase(), p))

  const colToProp = parsed.headers.map(h => byName.get(h.trim().toLowerCase()) ?? null)
  const matched = parsed.headers.filter((_, i) => colToProp[i] !== null)
  const unmatched = parsed.headers.filter((_, i) => colToProp[i] === null)

  const records = parsed.rows
    .filter(cells => cells.some(c => c.trim() !== ''))
    .map(cells => {
      const props: Record<string, unknown> = {}
      // defaults first
      database.properties.forEach(p => {
        props[p.id] = propertyDefFor(p.type).defaultValue(p)
      })
      cells.forEach((cell, i) => {
        const prop = colToProp[i]
        if (!prop) return
        if (prop.type === 'formula' || prop.type === 'rollup' || prop.type === 'created_time' || prop.type === 'updated_time') return
        props[prop.id] = parseCsvCell(prop, cell)
      })
      // ensure title (first prop) is never blank
      const first = database.properties[0]
      if (first) {
        const t = props[first.id]
        const blank = t === '' || t === null || t === undefined || (Array.isArray(t) && t.length === 0)
        if (blank) props[first.id] = 'Untitled'
      }
      return props
    })

  return { records, matched, unmatched }
}

export function downloadFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'database'
}

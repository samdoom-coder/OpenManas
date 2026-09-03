import type { DatabaseProperty, PropertyType } from '@/lib/types'

export interface PropertyDef {
  type: PropertyType
  label: string
  description: string
  icon: string
  needsOptions: boolean
  defaultValue: (prop?: DatabaseProperty) => unknown
}

export const PROPERTY_DEFS: PropertyDef[] = [
  { type: 'text', label: 'Text', description: 'Plain text', icon: 'T', needsOptions: false, defaultValue: () => '' },
  { type: 'number', label: 'Number', description: 'Numbers with sorting', icon: '#', needsOptions: false, defaultValue: () => '' },
  { type: 'select', label: 'Select', description: 'One option', icon: '◉', needsOptions: true, defaultValue: (p) => p?.options?.[0] ?? '' },
  { type: 'multi_select', label: 'Multi-select', description: 'Multiple options', icon: '☷', needsOptions: true, defaultValue: () => [] },
  { type: 'status', label: 'Status', description: 'Todo / Doing / Done', icon: '◐', needsOptions: true, defaultValue: (p) => p?.options?.[0] ?? 'Todo' },
  { type: 'checkbox', label: 'Checkbox', description: 'Checked or not', icon: '☑', needsOptions: false, defaultValue: () => false },
  { type: 'date', label: 'Date', description: 'Calendar date', icon: '📅', needsOptions: false, defaultValue: () => '' },
  { type: 'date_range', label: 'Date range', description: 'Start → end', icon: '↔', needsOptions: false, defaultValue: () => '' },
  { type: 'person', label: 'Person', description: 'Assignee', icon: '👤', needsOptions: false, defaultValue: () => '' },
  { type: 'url', label: 'URL', description: 'Link', icon: '🔗', needsOptions: false, defaultValue: () => '' },
  { type: 'email', label: 'Email', description: 'Email address', icon: '@', needsOptions: false, defaultValue: () => '' },
  { type: 'phone', label: 'Phone', description: 'Phone number', icon: '☎', needsOptions: false, defaultValue: () => '' },
  { type: 'relation', label: 'Relation', description: 'Link records', icon: '⇄', needsOptions: false, defaultValue: () => '' },
  { type: 'rollup', label: 'Rollup', description: 'Computed (read-only)', icon: 'Σ', needsOptions: false, defaultValue: () => '' },
  { type: 'formula', label: 'Formula', description: 'Computed (read-only)', icon: 'ƒ', needsOptions: false, defaultValue: () => '' },
  { type: 'created_time', label: 'Created time', description: 'Auto timestamp', icon: '🕒', needsOptions: false, defaultValue: () => '' },
  { type: 'updated_time', label: 'Last edited', description: 'Auto timestamp', icon: '🕘', needsOptions: false, defaultValue: () => '' },
]

export const propertyDefFor = (type: PropertyType): PropertyDef =>
  PROPERTY_DEFS.find((d) => d.type === type) ?? PROPERTY_DEFS[0]

export const isOptionType = (type: PropertyType) => type === 'select' || type === 'multi_select' || type === 'status'
export const isReadOnlyType = (type: PropertyType) => type === 'formula' || type === 'rollup' || type === 'created_time' || type === 'updated_time'

/** Coerce raw editor input into the stored value shape for a property type. */
export function coercePropertyValue(prop: DatabaseProperty, raw: unknown): unknown {
  switch (prop.type) {
    case 'checkbox':
      return !!raw
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return ''
      const n = Number(raw)
      return Number.isNaN(n) ? raw : n
    }
    case 'multi_select':
      return Array.isArray(raw) ? raw : raw ? [String(raw)] : []
    case 'select':
    case 'status':
    case 'text':
    case 'date':
    case 'date_range':
    case 'person':
    case 'url':
    case 'email':
    case 'phone':
    case 'relation':
      return raw ?? ''
    default:
      return raw ?? ''
  }
}

/** Title of a record = value of the database's first property (Notion-style). */
export function getRecordTitle(
  database: { properties: DatabaseProperty[] },
  record: { properties: Record<string, unknown> },
): string {
  const first = database.properties[0]
  const v = first ? record.properties[first.id] : undefined
  if (Array.isArray(v)) {
    const s = v.map(String).join(', ').trim()
    return s || 'Untitled'
  }
  const s = String(v ?? '').trim()
  return s || 'Untitled'
}

export function displayPropertyValue(prop: DatabaseProperty, value: unknown, createdAt?: string, updatedAt?: string): string {
  if (prop.type === 'created_time') return createdAt ? new Date(createdAt).toLocaleString() : ''
  if (prop.type === 'updated_time') return updatedAt ? new Date(updatedAt).toLocaleString() : ''
  if (value === undefined || value === null) return ''
  if (prop.type === 'multi_select' && Array.isArray(value)) return (value as string[]).join(', ')
  if (prop.type === 'checkbox') return value ? 'Yes' : 'No'
  if (prop.type === 'date' && value) {
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()
  }
  return String(value)
}

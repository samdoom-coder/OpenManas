// Form block data model + pure helpers (framework-free, see tests/forms.test.ts).
// A form block stores its definition as JSON in `block.content`:
//   { title: string, description: string, fields: FormField[] }
// Collected responses live in `block.properties.responses` (synced + persisted
// like any block property):
//   [{ id: string, at: string, values: Record<fieldId, string|boolean> }]

export type FormFieldType = 'text' | 'textarea' | 'email' | 'number' | 'select' | 'checkbox' | 'date'

export interface FormField {
  id: string
  label: string
  type: FormFieldType
  required: boolean
  options: string[] // dropdown choices (select only)
  placeholder?: string
}

export interface FormData {
  title: string
  description: string
  fields: FormField[]
}

export interface FormResponse {
  id: string
  at: string
  values: Record<string, string | boolean>
}

export const FORM_FIELD_TYPES: { type: FormFieldType; label: string }[] = [
  { type: 'text', label: 'Short text' },
  { type: 'textarea', label: 'Long text' },
  { type: 'email', label: 'Email' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Dropdown' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'date', label: 'Date' },
]

export function isFormFieldType(v: unknown): v is FormFieldType {
  return typeof v === 'string' && FORM_FIELD_TYPES.some((f) => f.type === v)
}

let fieldSeq = 0
/** Client-side field id (block ids come from the store's uid()). */
export function newFieldId(): string {
  fieldSeq += 1
  return `f${Date.now().toString(36)}${fieldSeq.toString(36)}`
}

export function defaultField(type: FormFieldType = 'text'): FormField {
  return { id: newFieldId(), label: '', type, required: false, options: type === 'select' ? ['Option 1'] : [] }
}

export function defaultFormData(): FormData {
  return {
    title: 'Untitled form',
    description: '',
    fields: [
      { ...defaultField('text'), label: 'Name', required: true },
      { ...defaultField('email'), label: 'Email', required: true },
    ],
  }
}

function cleanField(f: unknown): FormField | null {
  if (!f || typeof f !== 'object') return null
  const o = f as Record<string, unknown>
  const type = isFormFieldType(o.type) ? o.type : 'text'
  const options = Array.isArray(o.options)
    ? o.options.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 50)
    : []
  return {
    id: typeof o.id === 'string' && o.id ? o.id.slice(0, 64) : newFieldId(),
    label: typeof o.label === 'string' ? o.label.slice(0, 120) : '',
    type,
    required: o.required === true,
    options: type === 'select' ? (options.length > 0 ? options : ['Option 1']) : [],
    placeholder: typeof o.placeholder === 'string' ? o.placeholder.slice(0, 120) : undefined,
  }
}

/**
 * Parse form JSON from block content. Never throws — invalid/empty content
 * falls back to starter fields so a new form always renders something.
 */
export function parseFormContent(content: string): FormData {
  const fallback = defaultFormData()
  if (!content || !content.trim()) return fallback
  try {
    const p = JSON.parse(content) as Partial<FormData>
    const fields = Array.isArray(p.fields)
      ? p.fields.map(cleanField).filter((f): f is FormField => f !== null).slice(0, 50)
      : []
    return {
      title: typeof p.title === 'string' && p.title ? p.title.slice(0, 120) : fallback.title,
      description: typeof p.description === 'string' ? p.description.slice(0, 500) : '',
      fields: fields.length > 0 ? fields : fallback.fields,
    }
  } catch {
    return fallback
  }
}

/** Responses stored in block.properties — tolerant of foreign shapes. */
export function parseResponses(properties: unknown): FormResponse[] {
  const p = (properties || {}) as Record<string, unknown>
  if (!Array.isArray(p.responses)) return []
  return p.responses
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : '',
      at: typeof r.at === 'string' ? r.at : '',
      values: (r.values && typeof r.values === 'object' ? r.values : {}) as Record<string, string | boolean>,
    }))
    .filter((r) => r.id)
    .slice(0, 2000)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validate a draft against the form. Returns fieldId → message ({} = valid).
 * Empty non-required fields always pass.
 */
export function validateResponse(data: FormData, values: Record<string, string | boolean>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of data.fields) {
    const v = values[f.id]
    if (f.required && (v === undefined || v === null || String(v).trim() === '' || (f.type === 'checkbox' && v !== true))) {
      errors[f.id] = 'Required'
      continue
    }
    if (v === undefined || v === null || String(v).trim() === '') continue
    const s = String(v).trim()
    if (f.type === 'email' && !EMAIL_RE.test(s)) errors[f.id] = 'Enter a valid email'
    else if (f.type === 'number' && !Number.isFinite(Number(s))) errors[f.id] = 'Enter a number'
    else if (f.type === 'select' && !f.options.includes(s)) errors[f.id] = 'Pick one of the options'
  }
  return errors
}

/** Serialize one response value for display/CSV. */
export function displayValue(v: string | boolean | undefined): string {
  if (v === true) return 'Yes'
  if (v === false || v === undefined) return ''
  return String(v)
}

/** Escape one CSV cell (quotes, commas, newlines). */
export function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Form responses → CSV text (header = field labels). */
export function responsesToCsv(data: FormData, responses: FormResponse[]): string {
  const head = ['Submitted', ...data.fields.map((f) => f.label || 'Untitled')]
  const lines = [head.map(csvCell).join(',')]
  for (const r of responses) {
    lines.push([r.at, ...data.fields.map((f) => displayValue(r.values[f.id]))].map(csvCell).join(','))
  }
  return lines.join('\n')
}

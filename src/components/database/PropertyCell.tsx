import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Link2, Mail, Phone, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DatabaseProperty, DatabaseRecord } from '@/lib/types'
import { coercePropertyValue, displayPropertyValue } from '@/lib/propertyDefs'
import { getDerivedValue } from '@/lib/databaseEngine'
import { useAppStore } from '@/stores/appStore'

export function optionColor(v: string) {
  if (['Done', 'Completed', 'High', 'Urgent', 'Active'].includes(v)) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (['In Progress', 'Doing', 'Medium', 'Planning'].includes(v)) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (['Todo', 'Low', 'Paused'].includes(v)) return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
  if (['Review'].includes(v)) return 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
  // deterministic fallback by hash
  const hues = ['blue', 'violet', 'pink', 'cyan', 'orange', 'lime']
  let h = 0
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) % 997
  const pick = hues[h % hues.length]
  const map: Record<string, string> = {
    blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
    cyan: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    lime: 'bg-lime-500/15 text-lime-700 dark:text-lime-300',
  }
  return map[pick]
}

function normalizeMulti(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (value === undefined || value === null || value === '') return []
  return String(value).split(',').map((s) => s.trim()).filter(Boolean)
}

export function PropertyCell({
  prop,
  record,
  value,
  editing,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  prop: DatabaseProperty
  record?: DatabaseRecord
  value: unknown
  editing: boolean
  onStartEdit: () => void
  onCommit: (value: unknown) => void
  onCancel: () => void
}) {
  const commit = (raw: unknown) => onCommit(coercePropertyValue(prop, raw))

  // Derived columns: when Settings → Databases → rollupFormulas is on,
  // formula/rollup evaluate live (Postgres: generated column / read-model).
  const rollupsOn = useAppStore(s => s.settings?.databases?.rollupFormulas ?? false)
  const derived = useAppStore(s => {
    if (!rollupsOn) return null
    if (prop.type !== 'formula' && prop.type !== 'rollup') return null
    const db = s.databases.find(d => d.properties.some(p => p.id === prop.id))
    if (!db || !record) return null
    try {
      return getDerivedValue(prop, { database: db, record, allRecords: s.records })
    } catch { return null }
  })
  const displayValue = derived !== null && derived !== undefined ? derived : value

  // ---- checkbox: inline toggle, no edit mode ----
  if (prop.type === 'checkbox') {
    return (
      <span className="flex items-center justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation()
            commit(!value)
          }}
          aria-label="toggle checkbox"
          className={cn(
            'grid h-5 w-5 place-items-center rounded-md border transition-colors',
            value ? 'border-violet-500 bg-violet-500 text-white' : 'border-input bg-background hover:border-violet-500',
          )}
        >
          {!!value && <Check size={13} />}
        </button>
      </span>
    )
  }

  // ---- read-only ----
  if (prop.type === 'formula' || prop.type === 'rollup' || prop.type === 'created_time' || prop.type === 'updated_time') {
    return (
      <span className="block truncate text-[13px] text-muted-foreground" title={displayPropertyValue(prop, displayValue, record?.createdAt, record?.updatedAt)}>
        {displayPropertyValue(prop, displayValue, record?.createdAt, record?.updatedAt) || <span className="opacity-40">—</span>}
      </span>
    )
  }

  if (!editing) {
    return <CellViewer prop={prop} record={record} value={value} onStartEdit={onStartEdit} />
  }

  switch (prop.type) {
    case 'select':
    case 'status':
      return <SelectEditor prop={prop} value={value} onCommit={commit} onCancel={onCancel} />
    case 'multi_select':
      return <MultiSelectEditor prop={prop} value={value} onCommit={commit} onCancel={onCancel} />
    case 'date':
      return <DateEditor value={value} onCommit={commit} onCancel={onCancel} />
    case 'number':
      return <TextEditor inputMode="decimal" value={value} onCommit={commit} onCancel={onCancel} placeholder="0" />
    case 'url':
      return <TextEditor inputMode="url" value={value} onCommit={commit} onCancel={onCancel} placeholder="https://…" />
    case 'email':
      return <TextEditor inputMode="email" value={value} onCommit={commit} onCancel={onCancel} placeholder="name@company.com" />
    case 'phone':
      return <TextEditor inputMode="tel" value={value} onCommit={commit} onCancel={onCancel} placeholder="+1 555 000 1234" />
    case 'person':
    case 'relation':
      return <PersonRelationEditor prop={prop} value={value} onCommit={commit} onCancel={onCancel} />
    default:
      return <TextEditor value={value} onCommit={commit} onCancel={onCancel} placeholder={prop.type === 'text' ? 'Empty' : `Empty ${prop.name}`} />
  }
}

function CellViewer({ prop, record, value, onStartEdit }: { prop: DatabaseProperty; record?: DatabaseRecord; value: unknown; onStartEdit: () => void }) {
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)

  if ((prop.type === 'select' || prop.type === 'status') && !empty) {
    return (
      <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="block max-w-full text-left">
        <span className={cn('inline-block max-w-full truncate rounded-md px-1.5 py-px text-[13px]', optionColor(String(value)))}>{String(value)}</span>
      </button>
    )
  }
  if (prop.type === 'multi_select' && !empty) {
    const arr = normalizeMulti(value)
    return (
      <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="flex max-w-full flex-wrap gap-1 text-left">
        {arr.map((v) => (
          <span key={v} className={cn('inline-block max-w-full truncate rounded-md px-1.5 py-px text-[13px]', optionColor(v))}>{v}</span>
        ))}
      </button>
    )
  }
  if (prop.type === 'date' && !empty) {
    const d = new Date(String(value))
    return (
      <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="whitespace-nowrap text-[13px] hover:underline">
        {Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </button>
    )
  }
  if (prop.type === 'person' && !empty) {
    const name = String(value)
    const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    return (
      <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="flex min-w-0 items-center gap-1.5 text-left">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-[9px] font-bold text-white">{initials || '•'}</span>
        <span className="truncate text-[13px]">{name}</span>
      </button>
    )
  }
  if ((prop.type === 'url' || prop.type === 'email' || prop.type === 'phone') && !empty) {
    const href = prop.type === 'email' ? `mailto:${value}` : prop.type === 'phone' ? `tel:${value}` : String(value).startsWith('http') ? String(value) : `https://${value}`
    const Icon = prop.type === 'email' ? Mail : prop.type === 'phone' ? Phone : Link2
    return (
      <span className="flex min-w-0 items-center gap-1">
        <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-1 truncate text-[13px] text-blue-600 hover:underline dark:text-blue-400">
          <Icon size={12} className="shrink-0" />
          <span className="truncate">{String(value)}</span>
        </a>
        <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="shrink-0 rounded px-1 text-[11px] text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 hover:opacity-100" title="Edit">✎</button>
      </span>
    )
  }
  if (prop.type === 'number' && !empty) {
    return (
      <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="block font-mono text-[13px]">
        {String(value)}
      </button>
    )
  }
  if (prop.type === 'relation' && !empty) {
    return (
      <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="block max-w-full text-left">
        <span className="inline-block max-w-full truncate rounded-md bg-muted px-1.5 py-px text-[13px] text-muted-foreground">⇄ {String(value)}</span>
      </button>
    )
  }
  if (!empty) {
    return (
      <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="block w-full truncate text-left text-[13px] leading-5" title={String(value)}>
        {String(value)}
      </button>
    )
  }
  void record
  return (
    <button onClick={(e) => { e.stopPropagation(); onStartEdit() }} className="block w-full rounded px-1 py-0.5 text-left text-[13px] text-muted-foreground/0 hover:bg-black/5 hover:text-muted-foreground/60 dark:hover:bg-white/5">
      Empty
    </button>
  )
}

function useDismiss(onCancel: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
}

function TextEditor({ value, onCommit, onCancel, placeholder, inputMode }: { value: unknown; onCommit: (v: unknown) => void; onCancel: () => void; placeholder?: string; inputMode?: 'text' | 'decimal' | 'url' | 'email' | 'tel' }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const ref = useRef<HTMLInputElement>(null)
  useDismiss(onCancel)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      value={draft}
      inputMode={inputMode}
      type={inputMode === 'decimal' ? 'number' : inputMode === 'email' ? 'email' : inputMode === 'url' ? 'url' : 'text'}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') onCancel()
        e.stopPropagation()
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full min-w-0 rounded-lg border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

function DateEditor({ value, onCommit, onCancel }: { value: unknown; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const iso = String(value ?? '').slice(0, 10)
  const [draft, setDraft] = useState(iso)
  const ref = useRef<HTMLInputElement>(null)
  useDismiss(onCancel)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        type="date"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          onCommit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
        className="w-full min-w-0 rounded-lg border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
      />
      {draft && (
        <button onClick={() => onCommit('')} className="shrink-0 rounded p-1 hover:bg-accent" title="Clear date"><X size={12} /></button>
      )}
    </span>
  )
}

function SelectEditor({ prop, value, onCommit, onCancel }: { prop: DatabaseProperty; value: unknown; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const { updateProperty } = useAppStore()
  const databaseId = useAppStore((s) => s.databases.find((d) => d.properties.some((p) => p.id === prop.id))?.id)
  const options = prop.options ?? []
  const [q, setQ] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newOpt, setNewOpt] = useState('')
  useDismiss(onCancel)
  const filtered = useMemo(() => (q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options), [options, q])

  const addOption = () => {
    const name = (showAdd ? newOpt : q).trim()
    if (!name || !databaseId) return
    if (!options.includes(name)) updateProperty(databaseId, prop.id, { options: [...options, name] })
    onCommit(name)
  }

  return (
    <span className="relative block" onClick={(e) => e.stopPropagation()}>
      <span className="fixed inset-0 z-30" onClick={onCancel} />
      <span className="absolute left-0 top-full z-40 mt-1 block w-[220px] overflow-hidden rounded-xl border bg-popover shadow-xl">
        <span className="block p-1.5">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOption(); e.stopPropagation() }} placeholder="Search or create…" className="h-8 w-full rounded-lg border bg-background px-2 text-xs outline-none" />
        </span>
        <span className="block max-h-[200px] overflow-auto p-1.5 pt-0">
          {filtered.map((o) => (
            <button
              key={o}
              onClick={() => onCommit(o)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <span className={cn('inline-block max-w-[160px] truncate rounded-full px-2 py-0.5 text-xs font-medium', optionColor(o))}>{o}</span>
              {String(value) === o && <Check size={13} className="ml-auto text-violet-600" />}
            </button>
          ))}
          {filtered.length === 0 && <span className="block px-2 py-3 text-center text-xs text-muted-foreground">No options. Press Enter to create “{q}”.</span>}
        </span>
        <span className="block border-t p-1.5">
          {showAdd ? (
            <span className="flex items-center gap-1">
              <input value={newOpt} onChange={(e) => setNewOpt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOption(); e.stopPropagation() }} placeholder="Option name…" className="h-7 flex-1 rounded-lg border bg-background px-2 text-xs outline-none" />
              <button onClick={addOption} className="rounded-lg bg-primary px-2 py-1 text-xs text-primary-foreground">Add</button>
            </span>
          ) : (
            <button onClick={() => { if (q.trim()) addOption(); else setShowAdd(true) }} className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <Plus size={13} /> {q.trim() ? `Create “${q.trim()}”` : 'Add option'}
            </button>
          )}
          {value !== '' && value !== undefined && (
            <button onClick={() => onCommit('')} className="mt-1 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-red-600">
              <X size={13} /> Clear
            </button>
          )}
        </span>
      </span>
    </span>
  )
}

function MultiSelectEditor({ prop, value, onCommit, onCancel }: { prop: DatabaseProperty; value: unknown; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const { updateProperty } = useAppStore()
  const databaseId = useAppStore((s) => s.databases.find((d) => d.properties.some((p) => p.id === prop.id))?.id)
  const options = prop.options ?? []
  const selected = normalizeMulti(value)
  const [q, setQ] = useState('')
  useDismiss(onCancel)

  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]
    onCommit(next)
  }
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options

  return (
    <span className="relative block" onClick={(e) => e.stopPropagation()}>
      <span className="fixed inset-0 z-30" onClick={onCancel} />
      <span className="absolute left-0 top-full z-40 mt-1 block w-[240px] overflow-hidden rounded-xl border bg-popover shadow-xl">
        <span className="flex flex-wrap gap-1 border-b p-2">
          {selected.length === 0 && <span className="text-xs text-muted-foreground">No selection</span>}
          {selected.map((s) => (
            <span key={s} className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', optionColor(s))}>
              {s}
              <button onClick={() => toggle(s)} className="hover:opacity-70"><X size={11} /></button>
            </span>
          ))}
        </span>
        <span className="block p-1.5">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search…" className="h-8 w-full rounded-lg border bg-background px-2 text-xs outline-none" />
        </span>
        <span className="block max-h-[180px] overflow-auto p-1.5 pt-0">
          {filtered.map((o) => (
            <button key={o} onClick={() => toggle(o)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent">
              <span className={cn('grid h-4 w-4 place-items-center rounded border', selected.includes(o) ? 'border-violet-500 bg-violet-500 text-white' : 'border-input')}>
                {selected.includes(o) && <Check size={11} />}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', optionColor(o))}>{o}</span>
            </button>
          ))}
          {q.trim() && !options.includes(q.trim()) && (
            <button
              onClick={() => {
                if (!databaseId) return
                updateProperty(databaseId, prop.id, { options: [...options, q.trim()] })
                toggle(q.trim())
                setQ('')
              }}
              className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <Plus size={13} /> Create “{q.trim()}”
            </button>
          )}
        </span>
      </span>
    </span>
  )
}

function PersonRelationEditor({ prop, value, onCommit, onCancel }: { prop: DatabaseProperty; value: unknown; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const ref = useRef<HTMLInputElement>(null)
  const relatedOptions = useAppStore((s) => {
    if (prop.type !== 'relation' || !prop.relationDatabaseId) return [] as string[]
    const relDb = s.databases.find((d) => d.id === prop.relationDatabaseId)
    const titleProp = relDb?.properties[0]?.id
    return s.records.filter((r) => r.databaseId === prop.relationDatabaseId).map((r) => String(titleProp ? r.properties[titleProp] : Object.values(r.properties)[0] ?? '')).filter(Boolean).slice(0, 20)
  })
  useDismiss(onCancel)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const listId = `rel-${prop.id}`
  return (
    <span onClick={(e) => e.stopPropagation()} className="block">
      <input
        ref={ref}
        value={draft}
        list={relatedOptions.length ? listId : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
        placeholder={prop.type === 'person' ? 'Assign person…' : 'Link record…'}
        className="w-full min-w-0 rounded-lg border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {relatedOptions.length > 0 && (
        <datalist id={listId}>
          {relatedOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </span>
  )
}

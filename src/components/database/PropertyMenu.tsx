import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database, DatabaseProperty, PropertyType } from '@/lib/types'
import { PROPERTY_DEFS, isOptionType } from '@/lib/propertyDefs'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

/** Notion-like column header dropdown. */
export function ColumnHeaderMenu({
  database,
  property,
  onClose,
  onEdit,
  onHide,
}: {
  database: Database
  property: DatabaseProperty
  onClose: () => void
  onEdit: () => void
  onHide: () => void
}) {
  const { reorderProperty, duplicateProperty, deleteProperty } = useAppStore()
  const idx = database.properties.findIndex((p) => p.id === property.id)
  const def = PROPERTY_DEFS.find((d) => d.type === property.type)

  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-accent'

  return (
    <span className="block" onClick={(e) => e.stopPropagation()}>
      <span className="fixed inset-0 z-30 cursor-default" onClick={onClose} />
      <span className="absolute left-0 top-full z-40 mt-1 block w-[240px] overflow-hidden rounded-xl border bg-popover p-1.5 shadow-xl">
        <span className="flex items-center gap-2 px-2.5 py-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-muted text-xs font-bold">{def?.icon ?? 'T'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{property.name}</span>
            <span className="block text-[11px] text-muted-foreground capitalize">{property.type.replace('_', ' ')} • column {idx + 1}</span>
          </span>
        </span>
        <span className="my-1 block h-px bg-border" />
        <button className={item} onClick={() => { onEdit(); }}>
          <Pencil size={14} className="text-muted-foreground" /> Edit property…
        </button>
        <button className={item} onClick={() => { onHide(); onClose() }}>
          <EyeOff size={14} className="text-muted-foreground" /> Hide in view
        </button>
        <span className="grid grid-cols-2 gap-1 p-1">
          <button
            disabled={idx === 0}
            onClick={() => reorderProperty(database.id, property.id, 'left')}
            className="flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-40"
          >
            <ArrowLeft size={12} /> Left
          </button>
          <button
            disabled={idx === database.properties.length - 1}
            onClick={() => reorderProperty(database.id, property.id, 'right')}
            className="flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-40"
          >
            Right <ArrowRight size={12} />
          </button>
        </span>
        <button className={item} onClick={() => { duplicateProperty(database.id, property.id); onClose() }}>
          <Copy size={14} className="text-muted-foreground" /> Duplicate
        </button>
        <span className="my-1 block h-px bg-border" />
        <button
          className={cn(item, 'text-red-600 hover:bg-red-500/10')}
          onClick={() => {
            if (database.properties.length <= 1) return
            if (confirm(`Delete column “${property.name}”? Values in this column will be removed.`)) {
              deleteProperty(database.id, property.id)
              onClose()
            }
          }}
        >
          <Trash2 size={14} /> Delete
        </button>
      </span>
    </span>
  )
}

function TypeGrid({ value, onPick }: { value: PropertyType; onPick: (t: PropertyType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PROPERTY_DEFS.map((d) => (
        <button
          key={d.type}
          onClick={() => onPick(d.type)}
          title={d.description}
          className={cn(
            'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors hover:bg-accent',
            value === d.type ? 'border-violet-500 bg-violet-500/10' : 'border-border',
          )}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold">{d.icon}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium leading-tight">{d.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{d.description}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function OptionsEditor({
  options,
  onChange,
}: {
  options: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const rename = (i: number, v: string) => {
    const next = [...options]
    next[i] = v
    onChange(next)
  }
  const remove = (i: number) => onChange(options.filter((_, j) => j !== i))
  const add = () => {
    const name = draft.trim()
    if (!name || options.includes(name)) return
    onChange([...options, name])
    setDraft('')
  }
  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={`opt-${i}`} className="flex items-center gap-1.5">
          <input
            value={o}
            onChange={(e) => rename(i, e.target.value)}
            className="h-8 flex-1 rounded-lg border bg-background px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={() => remove(i)} className="rounded-lg p-1.5 hover:bg-accent" title="Remove option">
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add an option…"
          className="h-8 flex-1 rounded-lg border border-dashed bg-background px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
        />
        <Button size="sm" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus size={13} />
        </Button>
      </div>
    </div>
  )
}

/** Create-column dialog (Notion's "+ New property"). */
export function AddPropertyDialog({ database, onClose }: { database: Database; onClose: () => void }) {
  const { addProperty } = useAppStore()
  const [name, setName] = useState('')
  const [type, setType] = useState<PropertyType>('text')
  const [options, setOptions] = useState<string[]>(['Option 1', 'Option 2'])
  const needsOptions = isOptionType(type)

  const create = () => {
    addProperty(database.id, { name: name.trim() || `Property ${database.properties.length + 1}`, type, options: needsOptions ? options.filter(Boolean) : undefined })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Add property" className="max-w-[520px]">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium">Name</label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="e.g. Priority, Due date, Owner…" className="mt-1" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium">Type — cells behave like this type</label>
          <TypeGrid value={type} onPick={setType} />
        </div>
        {needsOptions && (
          <div>
            <label className="mb-1.5 block text-xs font-medium">Options</label>
            <OptionsEditor options={options} onChange={setOptions} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={create}>Add column</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Edit-column dialog: rename, change type, edit options, relation target. */
export function EditPropertyDialog({ database, property, onClose }: { database: Database; property: DatabaseProperty; onClose: () => void }) {
  const { updateProperty, deleteProperty, databases } = useAppStore()
  const [name, setName] = useState(property.name)
  const [type, setType] = useState<PropertyType>(property.type)
  const [options, setOptions] = useState<string[]>(property.options ?? ['Option 1'])
  const [relationDb, setRelationDb] = useState(property.relationDatabaseId ?? '')
  const needsOptions = isOptionType(type)

  const save = () => {
    updateProperty(database.id, property.id, {
      name: name.trim() || property.name,
      type,
      options: needsOptions ? options.filter((o) => o.trim()) : undefined,
      relationDatabaseId: type === 'relation' ? relationDb || undefined : undefined,
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Edit — ${property.name}`} className="max-w-[520px]">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium">Type</label>
          <TypeGrid value={type} onPick={setType} />
          {type !== property.type && <p className="mt-1.5 text-[11px] text-amber-600">Values are kept and shown in the new format where possible.</p>}
        </div>
        {needsOptions && (
          <div>
            <label className="mb-1.5 block text-xs font-medium">Options — used by the cell dropdown</label>
            <OptionsEditor options={options} onChange={setOptions} />
          </div>
        )}
        {type === 'relation' && (
          <div>
            <label className="mb-1.5 block text-xs font-medium">Related database</label>
            <select value={relationDb} onChange={(e) => setRelationDb(e.target.value)} className="h-9 w-full rounded-xl border bg-background px-2 text-sm">
              <option value="">None (free text)</option>
              {databases.filter((d) => d.id !== database.id).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600"
            disabled={database.properties.length <= 1}
            onClick={() => {
              if (confirm(`Delete column “${property.name}”?`)) {
                deleteProperty(database.id, property.id)
                onClose()
              }
            }}
          >
            <Trash2 size={14} className="mr-1" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

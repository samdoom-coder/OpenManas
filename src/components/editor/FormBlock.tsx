// Form block: build a mini form (fields in `block.content` JSON, see
// lib/forms.ts), collect responses (stored in `block.properties.responses`,
// synced + persisted like any block edit), review/export them as CSV.
// Three tabs: Build | Respond | Responses — same full-width pattern as Chart.

import { useState, useEffect, useRef } from 'react'
import { ClipboardList, Plus, Trash2, Download, Eraser, ChevronUp, ChevronDown, Send, PencilLine, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uid } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { downloadFile } from '@/lib/csvUtils'
import { exportFilename } from '@/lib/pageExport'
import type { Block } from '@/lib/types'
import {
  parseFormContent, parseResponses, validateResponse, displayValue,
  responsesToCsv, defaultField, FORM_FIELD_TYPES,
  type FormData, type FormFieldType,
} from '@/lib/forms'

type Mode = 'build' | 'respond' | 'responses'

export function FormBlockView({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  const [data, setData] = useState<FormData>(() => parseFormContent(block.content || ''))
  const [mode, setMode] = useState<Mode>('build')
  const [draft, setDraft] = useState<Record<string, string | boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [justSent, setJustSent] = useState(false)
  const mounted = useRef(false)
  const { push } = useToast()

  // Persist definition edits. Skipped on first mount when content is already
  // saved (reload/pull remount must not fire a spurious PATCH); an empty
  // block still seeds its starter fields once.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      if (block.content && block.content.trim()) return
    }
    onChange({ content: JSON.stringify(data) })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const responses = parseResponses(block.properties)

  const setTitle = (title: string) => setData((d) => ({ ...d, title: title.slice(0, 120) }))
  const setDesc = (description: string) => setData((d) => ({ ...d, description: description.slice(0, 500) }))
  const patchField = (id: string, patch: Partial<{ label: string; type: FormFieldType; required: boolean; options: string[]; placeholder: string }>) =>
    setData((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  const addField = () =>
    setData((d) => (d.fields.length >= 50 ? d : { ...d, fields: [...d.fields, { ...defaultField('text'), label: `Question ${d.fields.length + 1}` }] }))
  const deleteField = (id: string) => setData((d) => ({ ...d, fields: d.fields.filter((f) => f.id !== id) }))
  const moveField = (id: string, dir: -1 | 1) =>
    setData((d) => {
      const i = d.fields.findIndex((f) => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= d.fields.length) return d
      const next = [...d.fields]
      const [moved] = next.splice(i, 1)
      next.splice(j, 0, moved)
      return { ...d, fields: next }
    })

  const submit = () => {
    const errs = validateResponse(data, draft)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const entry = { id: uid(), at: new Date().toISOString(), values: { ...draft } }
    onChange({ properties: { ...((block.properties as Record<string, unknown>) || {}), responses: [...responses, entry] } })
    setDraft({})
    setErrors({})
    setJustSent(true)
    setTimeout(() => setJustSent(false), 3000)
    push({ title: 'Response submitted', desc: `${data.title} — ${responses.length + 1} total.` })
  }

  const deleteResponse = (id: string) =>
    onChange({ properties: { ...((block.properties as Record<string, unknown>) || {}), responses: responses.filter((r) => r.id !== id) } })
  const clearResponses = () =>
    onChange({ properties: { ...((block.properties as Record<string, unknown>) || {}), responses: [] } })
  const exportCsv = () => {
    if (responses.length === 0) return
    downloadFile(exportFilename(`${data.title}-responses`, 'csv'), responsesToCsv(data, responses), 'text/csv')
    push({ title: 'Responses exported as CSV' })
  }

  return (
    <div className="rounded-xl border bg-background w-full max-w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
        <span className="text-muted-foreground"><ClipboardList size={15} /></span>
        <input
          value={data.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Form title"
          aria-label="Form title"
          className="flex-1 min-w-[120px] bg-transparent outline-none font-semibold text-sm placeholder:text-muted-foreground/50 px-1 py-1 rounded-md focus:bg-muted/50"
        />
        <div className="flex items-center gap-1 p-0.5 rounded-xl border bg-muted/20" role="tablist" aria-label="Form mode">
          {([['build', 'Build', PencilLine], ['respond', 'Respond', Send], ['responses', `Responses${responses.length ? ` (${responses.length})` : ''}`, Inbox]] as [Mode, string, typeof Send][]).map(([m, label, Icon]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium',
                mode === m ? 'bg-background shadow border' : 'hover:bg-accent text-muted-foreground',
              )}
            >
              <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      {data.description ? <div className="px-3 pt-1 text-xs text-muted-foreground">{data.description}</div> : null}

      <div className="p-3">
        {mode === 'build' && (
          <BuildMode data={data} setDesc={setDesc} patchField={patchField} addField={addField} deleteField={deleteField} moveField={moveField} />
        )}
        {mode === 'respond' && (
          <RespondMode
            data={data} draft={draft} errors={errors} justSent={justSent}
            setDraft={(id, v) => setDraft((d) => ({ ...d, [id]: v }))}
            submit={submit}
          />
        )}
        {mode === 'responses' && (
          <ResponsesMode
            data={data} responses={responses}
            deleteResponse={deleteResponse} clearResponses={clearResponses} exportCsv={exportCsv}
          />
        )}
      </div>
    </div>
  )
}

/* --------------------------------- Build --------------------------------- */

function BuildMode({ data, setDesc, patchField, addField, deleteField, moveField }: {
  data: FormData
  setDesc: (v: string) => void
  patchField: (id: string, patch: Partial<{ label: string; type: FormFieldType; required: boolean; options: string[]; placeholder: string }>) => void
  addField: () => void
  deleteField: (id: string) => void
  moveField: (id: string, dir: -1 | 1) => void
}) {
  return (
    <div className="space-y-2">
      <input
        value={data.description}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Form description (optional)"
        aria-label="Form description"
        className="w-full h-9 rounded-lg border bg-muted/20 px-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-violet-500"
      />
      <div className="space-y-1.5 max-h-[260px] overflow-auto">
        {data.fields.map((f, i) => (
          <div key={f.id} className="rounded-xl border bg-muted/20 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground w-5 shrink-0">{i + 1}</span>
              <input
                value={f.label}
                onChange={(e) => patchField(f.id, { label: e.target.value.slice(0, 120) })}
                placeholder={`Question ${i + 1}`}
                aria-label={`Label for field ${i + 1}`}
                className="flex-1 min-w-0 h-8 rounded-lg border bg-background px-2 text-[13px] outline-none focus:border-violet-500"
              />
              <select
                value={f.type}
                onChange={(e) => patchField(f.id, { type: e.target.value as FormFieldType })}
                aria-label={`Type for field ${i + 1}`}
                className="h-8 rounded-lg border bg-background px-1.5 text-[12px] outline-none"
              >
                {FORM_FIELD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
              <div className="flex items-center gap-0.5">
                <button onClick={() => moveField(f.id, -1)} disabled={i === 0} className="p-1 rounded-md hover:bg-accent disabled:opacity-30" title="Move up"><ChevronUp size={13} /></button>
                <button onClick={() => moveField(f.id, 1)} disabled={i === data.fields.length - 1} className="p-1 rounded-md hover:bg-accent disabled:opacity-30" title="Move down"><ChevronDown size={13} /></button>
                <button onClick={() => deleteField(f.id)} disabled={data.fields.length <= 1} className="p-1 rounded-md hover:bg-accent hover:text-red-600 disabled:opacity-30" title="Delete field"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="flex items-center gap-3 pl-7">
              <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={f.required} onChange={(e) => patchField(f.id, { required: e.target.checked })} className="rounded w-3.5 h-3.5" />
                Required
              </label>
              {f.type === 'select' && (
                <input
                  value={f.options.join(', ')}
                  onChange={(e) => patchField(f.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50) })}
                  placeholder="Options, comma separated"
                  aria-label={`Options for field ${i + 1}`}
                  className="flex-1 min-w-0 h-7 rounded-lg border bg-background px-2 text-[12px] outline-none focus:border-violet-500"
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <button onClick={addField} disabled={data.fields.length >= 50} className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 disabled:opacity-40">
        <Plus size={13} /> Add question
      </button>
    </div>
  )
}

/* -------------------------------- Respond -------------------------------- */

function RespondMode({ data, draft, errors, justSent, setDraft, submit }: {
  data: FormData
  draft: Record<string, string | boolean>
  errors: Record<string, string>
  justSent: boolean
  setDraft: (id: string, v: string | boolean) => void
  submit: () => void
}) {
  if (data.fields.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">No questions yet — add some in Build.</div>
  return (
    <div className="space-y-3">
      {data.fields.map((f) => (
        <label key={f.id} className="block">
          <span className="mb-1 flex items-baseline gap-1 text-[13px] font-medium">
            {f.label || 'Untitled question'}
            {f.required && <span className="text-red-500">*</span>}
          </span>
          <FieldInput
            fieldId={f.id}
            type={f.type}
            options={f.options}
            value={draft[f.id] ?? (f.type === 'checkbox' ? false : '')}
            onChange={(v) => setDraft(f.id, v)}
          />
          {errors[f.id] && <span className="mt-0.5 block text-[12px] text-red-600">{errors[f.id]}</span>}
        </label>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={submit} className="flex items-center gap-1.5 h-9 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">
          <Send size={14} /> Submit
        </button>
        {justSent && <span className="text-[13px] text-emerald-600">Thanks — response recorded ✓</span>}
      </div>
    </div>
  )
}

function FieldInput({ fieldId, type, options, value, onChange }: {
  fieldId: string
  type: FormFieldType
  options: string[]
  value: string | boolean
  onChange: (v: string | boolean) => void
}) {
  const cls = 'w-full min-h-[36px] rounded-lg border bg-muted/20 px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-violet-500'
  if (type === 'textarea') {
    return <textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={3} aria-label={fieldId} className={cn(cls, 'resize-y')} />
  }
  if (type === 'select') {
    return (
      <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} aria-label={fieldId} className={cn(cls, 'h-9')}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (type === 'checkbox') {
    return (
      <span className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} aria-label={fieldId} className="rounded w-4 h-4" />
        <span className="text-[13px] text-muted-foreground">Check to answer yes</span>
      </span>
    )
  }
  const inputType = type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'
  return <input type={inputType} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} aria-label={fieldId} className={cn(cls, 'h-9')} />
}

/* -------------------------------- Responses ------------------------------- */

function ResponsesMode({ data, responses, deleteResponse, clearResponses, exportCsv }: {
  data: FormData
  responses: { id: string; at: string; values: Record<string, string | boolean> }[]
  deleteResponse: (id: string) => void
  clearResponses: () => void
  exportCsv: () => void
}) {
  if (responses.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No responses yet — share the page and collect them in Respond.</div>
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted-foreground tabular-nums">{responses.length} response{responses.length === 1 ? '' : 's'}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <button onClick={exportCsv} className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[12px] hover:bg-accent"><Download size={13} /> CSV</button>
          <button onClick={clearResponses} className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[12px] hover:bg-accent hover:text-red-600"><Eraser size={13} /> Clear</button>
        </span>
      </div>
      <div className="space-y-1.5 max-h-[260px] overflow-auto">
        {[...responses].reverse().map((r) => (
          <div key={r.id} className="rounded-xl border bg-muted/20 p-2.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{r.at ? new Date(r.at).toLocaleString() : ''}</span>
              <button onClick={() => deleteResponse(r.id)} className="ml-auto p-1 rounded-md hover:bg-accent hover:text-red-600" title="Delete response"><Trash2 size={12} /></button>
            </div>
            <div className="mt-1 space-y-0.5">
              {data.fields.map((f) => (
                <div key={f.id} className="flex items-baseline gap-2 text-[13px]">
                  <span className="text-muted-foreground shrink-0">{f.label || 'Untitled'}:</span>
                  <span className="min-w-0 break-words font-medium">{displayValue(r.values[f.id]) || <span className="text-muted-foreground/60">—</span>}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

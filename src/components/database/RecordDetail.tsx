import { useState } from 'react'
import { ArrowUpRight, Send, Trash2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { BlockEditor } from '@/components/editor/BlockEditor'
import { PropertyCell } from '@/components/database/PropertyCell'
import { propertyDefFor, getRecordTitle } from '@/lib/propertyDefs'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/utils'

/**
 * Notion-like record page: editable title + type-aware properties,
 * full block editor on the linked page, and record comments.
 */
export function RecordDetailModal({ databaseId, recordId, onClose }: { databaseId: string; recordId: string; onClose: () => void }) {
  const { databases, records, updateRecord, deleteRecord, ensureRecordPage, setSelectedPage } = useAppStore()
  const database = databases.find((d) => d.id === databaseId)
  const record = records.find((r) => r.id === recordId)
  // create the backing page once per modal instance (no selection change)
  const [pageId] = useState(() => ensureRecordPage(recordId)?.id ?? null)
  const [editingProp, setEditingProp] = useState<string | null>(null)

  if (!database || !record) return null

  const titleProp = database.properties[0]
  const restProps = database.properties.slice(1)
  const title = getRecordTitle(database, record)

  const openFullPage = () => {
    if (pageId) {
      onClose()
      setSelectedPage(pageId)
    }
  }

  return (
    <Modal open onClose={onClose} className="max-w-[760px]">
      <div className="space-y-5">
        {/* header */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-1.5 py-0.5">▦ {database.name}</span>
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <button onClick={openFullPage} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 hover:bg-accent hover:text-foreground" title="Open as full page">
            <ArrowUpRight size={13} /> <span className="hidden sm:inline">Open as page</span>
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete “${title}”? Its page and comments go too.`)) {
                deleteRecord(record.id)
                onClose()
              }
            }}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            title="Delete record"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* title = first property */}
        {titleProp ? (
          <div onClick={(e) => e.stopPropagation()}>
            <PropertyTitleInput
              key={String(record.properties[titleProp.id] ?? '')}
              initial={String(record.properties[titleProp.id] ?? '')}
              onCommit={(v) => updateRecord(record.id, { [titleProp.id]: v })}
            />
          </div>
        ) : (
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        )}

        {/* properties */}
        <div className="overflow-hidden rounded-xl border">
          {restProps.map((p) => {
            const def = propertyDefFor(p.type)
            const key = `${record.id}:${p.id}`
            const isEditing = editingProp === key
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0 hover:bg-muted/40"
                onClick={(e) => {
                  e.stopPropagation()
                  if (p.type === 'checkbox' || isEditing) return
                  setEditingProp(key)
                }}
              >
                <span className="flex w-[160px] shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span className="text-xs">{def.icon}</span>
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                  <PropertyCell
                    prop={p}
                    record={record}
                    value={record.properties[p.id]}
                    editing={isEditing}
                    onStartEdit={() => setEditingProp(key)}
                    onCommit={(v) => {
                      updateRecord(record.id, { [p.id]: v })
                      if (p.type !== 'multi_select') setEditingProp(null)
                    }}
                    onCancel={() => setEditingProp(null)}
                  />
                </span>
              </div>
            )
          })}
          {restProps.length === 0 && (
            <div className="px-3 py-3 text-[13px] text-muted-foreground">No other properties. Add columns from the table view.</div>
          )}
        </div>

        {/* page body */}
        <div>
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Notes</div>
          {pageId ? (
            <div className="rounded-xl border px-3 py-2">
              <BlockEditor pageId={pageId} />
            </div>
          ) : (
            <div className="rounded-xl border p-4 text-sm text-muted-foreground">Could not create page.</div>
          )}
        </div>

        {/* comments */}
        <RecordComments recordId={record.id} pageId={pageId} />

        <div className="flex items-center justify-between border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
          <span>Created {new Date(record.createdAt).toLocaleString()}</span>
          <span>Edited {formatRelative(record.updatedAt)}</span>
        </div>
      </div>
    </Modal>
  )
}

function PropertyTitleInput({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(initial)
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim() || 'Untitled')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        e.stopPropagation()
      }}
      placeholder="Untitled"
      className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
    />
  )
}

function RecordComments({ recordId, pageId }: { recordId: string; pageId: string | null }) {
  const { comments, addComment, user } = useAppStore()
  const list = comments.filter((c) => c.recordId === recordId)
  const [text, setText] = useState('')

  const send = () => {
    const v = text.trim()
    if (!v || !pageId) return
    addComment({ pageId, blockId: undefined, recordId, authorId: user.id, content: v, parentId: null } as never)
    setText('')
  }

  return (
    <div>
      <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Comments • {list.length}</div>
      <div className="space-y-2">
        {list.length === 0 && (
          <div className="rounded-xl border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">No comments yet.</div>
        )}
        {list.map((c) => (
          <div key={c.id} className="flex gap-2.5 rounded-xl border bg-muted/30 p-3">
            <img src="https://i.pravatar.cc/100?img=15" alt="" className="h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{user.name}</span>
                <span className="text-[11px] text-muted-foreground">{formatRelative(c.createdAt)}</span>
              </div>
              <div className="mt-0.5 text-sm">{c.content}</div>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
              e.stopPropagation()
            }}
            placeholder="Add a comment…"
            className="h-9 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" disabled={!text.trim()} onClick={send} className="h-9">
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}

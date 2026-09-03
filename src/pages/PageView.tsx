import { useAppStore } from '@/stores/appStore'
import { BlockEditor } from '@/components/editor/BlockEditor'
import { Button } from '@/components/ui/button'
import { Star, Share2, MoreHorizontal, MessageSquare, History, Copy, Trash2, Archive, ImagePlus, MoveVertical, ArrowUp, ArrowDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { IconPicker } from '@/components/ui/iconPicker'
import { CoverPicker } from '@/components/ui/coverPicker'
import { resolveCover, clampCoverPosition, DEFAULT_COVER_POSITION } from '@/lib/coverData'
import { PageIcon } from '@/components/ui/pageIcon'

export function PageView({ pageId }: { pageId: string }) {
  const { pages, updatePage, deletePage, duplicatePage, toggleFavorite, blocks, addBlock } = useAppStore()
  const page = pages.find(p=> p.id===pageId)
  const [editingTitle, setEditingTitle] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [iconPicker, setIconPicker] = useState(false)
  const [coverAnchor, setCoverAnchor] = useState<'cover' | 'actions' | null>(null)
  const commentsRef = useRef<HTMLDivElement>(null)
  const iconBtnRef = useRef<HTMLDivElement>(null)

  // close icon picker on outside click / Escape
  useEffect(() => {
    if (!iconPicker) return
    const onDown = (e: MouseEvent) => {
      if (iconBtnRef.current && !iconBtnRef.current.contains(e.target as Node)) setIconPicker(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIconPicker(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [iconPicker])

  // close cover picker on outside click / Escape (triggers + popup carry data-cover-ui)
  useEffect(() => {
    if (!coverAnchor) return
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-cover-ui]')) return
      setCoverAnchor(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCoverAnchor(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [coverAnchor])

  if (!page) return <div className="p-8 text-center text-muted-foreground">Page not found or trashed.</div>
  if (page.isTrashed) return <TrashedView page={page} />

  const backlinks = findBacklinks(pageId, pages, blocks)

  return (
    <div className="max-w-[860px] mx-auto w-full">
      <PageCover page={page} anchor={coverAnchor} setAnchor={setCoverAnchor} />
      <div className="px-6 md:px-8 py-6 space-y-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 rounded-full border bg-muted">Private</span>
          <span>•</span>
          <span>Edited {new Date(page.updatedAt).toLocaleString()}</span>
          <span className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={()=> commentsRef.current?.scrollIntoView({ behavior:'smooth'})}><MessageSquare size={14} className="mr-1"/> Comments</Button>
            <Button variant="ghost" size="icon" onClick={()=> toggleFavorite(page.id)}><Star size={16} className={page.isFavorite ? 'fill-amber-400 text-amber-400':''}/></Button>
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="relative" ref={iconBtnRef}>
              <button
                onClick={() => setIconPicker(!iconPicker)}
                title="Change icon — emoji, Icons or upload"
                className="rounded-2xl p-1 transition-colors hover:bg-accent"
              >
                <PageIcon page={page} size="xl" className="rounded-2xl" />
              </button>
              {iconPicker && (
                <div className="absolute left-0 top-full z-30 mt-2">
                  <IconPicker
                    value={page}
                    onSelect={(patch) => {
                      updatePage(page.id, {
                        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
                        ...(patch.iconType !== undefined ? { iconType: patch.iconType } : {}),
                        ...(patch.customIcon !== undefined ? { customIcon: patch.customIcon } : { customIcon: undefined }),
                        // clearing: when switching to emoji/lucide/none, drop customIcon
                        ...(patch.iconType && patch.iconType !== 'custom' ? { customIcon: undefined } : {}),
                        ...(patch.iconType === 'none' ? { icon: undefined } : {}),
                      } as any)
                      // keep picker open while browsing uploads, close on definitive picks
                      if (patch.iconType === 'emoji' || patch.iconType === 'lucide' || patch.iconType === 'none') setIconPicker(false)
                      if (patch.iconType === 'custom' && patch.customIcon) setIconPicker(false)
                    }}
                    onClose={() => setIconPicker(false)}
                  />
                </div>
              )}
            </div>
            <div className="flex-1">
              {editingTitle ? (
                <input autoFocus defaultValue={page.title} onBlur={e=> { updatePage(page.id, { title: e.target.value || 'Untitled'}); setEditingTitle(false)}} onKeyDown={e=> e.key==='Enter' && (e.target as HTMLInputElement).blur()} className="w-full text-4xl font-bold tracking-tight bg-transparent outline-none border-b"/>
              ) : (
                <h1 onClick={()=> setEditingTitle(true)} className="text-4xl font-bold tracking-tight cursor-text hover:bg-accent/30 rounded-xl px-1 -mx-1">{page.title || 'Untitled'}</h1>
              )}
              <input placeholder="Add description..." defaultValue={page.description||''} onBlur={e=> updatePage(page.id, { description: e.target.value })} className="w-full mt-2 text-sm text-muted-foreground bg-transparent outline-none placeholder:text-muted-foreground/60"/>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-2 border-y text-xs">
            <PropertyPill label="Created" value={new Date(page.createdAt).toLocaleDateString()}/>
            <PropertyPill label="Updated" value={new Date(page.updatedAt).toLocaleDateString()}/>
            <PropertyPill label="Owner" value={useAppStore.getState().user.name}/>
            <div className="ml-auto flex items-center gap-1">
              <span className="relative" data-cover-ui>
                <Button variant="ghost" size="sm" onClick={()=> setCoverAnchor(coverAnchor === 'actions' ? null : 'actions')}><ImagePlus size={14} className="mr-1"/> Cover</Button>
                {coverAnchor === 'actions' && (
                  <span className="absolute right-0 top-full z-30 mt-2">
                    <CoverPicker value={page.cover} onSelect={(cover) => { updatePage(page.id, { cover } as never); setCoverAnchor(null) }} onClose={()=> setCoverAnchor(null)} />
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={()=> duplicatePage(page.id)}><Copy size={14} className="mr-1"/> Duplicate</Button>
              <Button variant="ghost" size="sm" onClick={()=> updatePage(page.id, { isArchived:true })}><Archive size={14} className="mr-1"/> Archive</Button>
              <Button variant="ghost" size="sm" onClick={()=> deletePage(page.id)} className="text-red-600"><Trash2 size={14} className="mr-1"/> Trash</Button>
            </div>
          </div>
        </div>

        <BlockEditor pageId={pageId} />

        <div className="pt-6 border-t space-y-6">
          {backlinks.length>0 && (
            <div className="rounded-2xl border p-4 bg-muted/20">
              <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Linked from — {backlinks.length}</div>
              <div className="space-y-1">{backlinks.map(b=> <div key={b.id} className="text-sm p-2 rounded-xl hover:bg-accent">{b.title}</div>)}</div>
            </div>
          )}

          <div ref={commentsRef} className="rounded-2xl border p-4">
            <div className="font-medium text-sm mb-3">Comments</div>
            <CommentSection pageId={pageId} />
          </div>

          <PageVersionHistory pageId={pageId} />
        </div>
      </div>
    </div>
  )
}

function PropertyPill({ label, value }: { label:string, value:string }) {
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-card text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></span>
}

function PageCover({ page, anchor, setAnchor }: { page: { id: string; cover?: string; coverPosition?: number }; anchor: 'cover' | 'actions' | null; setAnchor: (a: 'cover' | 'actions' | null) => void }) {
  const { updatePage } = useAppStore()
  const [repositioning, setRepositioning] = useState(false)
  const [draftPos, setDraftPos] = useState(DEFAULT_COVER_POSITION)
  const dragRef = useRef<{ startY: number; startPos: number; height: number } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const savedPos = clampCoverPosition(page.coverPosition ?? DEFAULT_COVER_POSITION)
  const shownPos = repositioning ? draftPos : savedPos

  if (!page.cover) return null
  const cover = resolveCover(page.cover)
  const isImage = cover.kind === 'image'

  const startReposition = () => {
    setDraftPos(savedPos)
    setRepositioning(true)
    setAnchor(null)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (!repositioning || !frameRef.current) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { startY: e.clientY, startPos: draftPos, height: frameRef.current.clientHeight || 180 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!repositioning || !d) return
    setDraftPos(clampCoverPosition(d.startPos - ((e.clientY - d.startY) / d.height) * 100))
  }
  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div data-cover-ui className="group/cover relative h-[180px] overflow-visible">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={repositioning ? 'h-[180px] cursor-grab touch-none select-none active:cursor-grabbing' : 'h-[180px]'}
      >
        {isImage ? (
          <img
            src={cover.src}
            alt=""
            draggable={false}
            className="h-[180px] w-full rounded-b-2xl bg-muted object-cover"
            style={{ objectPosition: `50% ${shownPos}%` }}
          />
        ) : (
          <div className={`h-[180px] rounded-b-2xl bg-gradient-to-br ${cover.preset.classes}`} />
        )}
      </div>

      {repositioning ? (
        <>
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1 text-xs shadow-sm backdrop-blur">
            <button onClick={() => setDraftPos((p) => clampCoverPosition(p - 2))} className="rounded p-1 hover:bg-accent" title="Nudge up">
              <ArrowUp size={13} />
            </button>
            <span className="min-w-[42px] text-center tabular-nums text-muted-foreground">{shownPos}%</span>
            <button onClick={() => setDraftPos((p) => clampCoverPosition(p + 2))} className="rounded p-1 hover:bg-accent" title="Nudge down">
              <ArrowDown size={13} />
            </button>
            <span className="hidden text-muted-foreground sm:inline">Drag image to reposition</span>
          </div>
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <button
              onClick={() => setRepositioning(false)}
              className="rounded-lg border bg-card/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                updatePage(page.id, { coverPosition: draftPos })
                setRepositioning(false)
              }}
              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:opacity-90"
            >
              Save position
            </button>
          </div>
        </>
      ) : (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-within:opacity-100">
          {isImage && (
            <button
              onClick={startReposition}
              className="flex items-center gap-1 rounded-lg border bg-card/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent"
            >
              <MoveVertical size={13} /> Reposition
            </button>
          )}
          <button
            onClick={() => setAnchor(anchor === 'cover' ? null : 'cover')}
            className="rounded-lg border bg-card/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent"
          >
            Change cover
          </button>
          <button
            onClick={() => updatePage(page.id, { cover: undefined } as never)}
            className="rounded-lg border bg-card/90 px-2 py-1.5 text-xs shadow-sm backdrop-blur hover:bg-accent hover:text-red-600"
            title="Remove cover"
          >
            ✕
          </button>
        </div>
      )}
      {anchor === 'cover' && !repositioning && (
        <div className="absolute right-3 top-12 z-30">
          <CoverPicker value={page.cover} onSelect={(c) => { updatePage(page.id, { cover: c } as never); setAnchor(null) }} onClose={() => setAnchor(null)} />
        </div>
      )}
    </div>
  )
}

function findBacklinks(pageId:string, pages:any[], blocks:any[]) {
  // naive: blocks that mention pageId or pages that have relation
  const linkingBlocks = blocks.filter(b=> b.content.includes(pageId) || String(b.properties?.pageId)===pageId)
  const pageIds = [...new Set(linkingBlocks.map(b=> b.pageId))]
  return pages.filter(p=> pageIds.includes(p.id) && p.id!==pageId)
}

function TrashedView({ page }: { page:any }) {
  const { restorePage } = useAppStore() as any
  // add restore fn in store if missing
  return (
    <div className="max-w-[600px] mx-auto p-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-muted grid place-items-center mx-auto mb-4"><Trash2 size={20}/></div>
      <h2 className="text-xl font-semibold">{page.title} is in Trash</h2>
      <p className="text-sm text-muted-foreground mt-2">Restore to continue editing or delete permanently.</p>
      <div className="flex justify-center gap-2 mt-6">
        <Button onClick={()=> restorePage(page.id)}>Restore</Button>
        <Button variant="outline">Delete forever</Button>
      </div>
    </div>
  )
}

function CommentSection({ pageId }: { pageId:string }) {
  const { comments, addComment, user } = useAppStore()
  const pageComments = comments.filter(c=> c.pageId===pageId)
  const [text, setText] = useState('')
  return (
    <div className="space-y-3">
      {pageComments.length===0 && <div className="text-sm text-muted-foreground py-4 text-center border rounded-xl border-dashed">No comments yet. Start a discussion.</div>}
      {pageComments.map(c=> (
        <div key={c.id} className="flex gap-3 p-3 rounded-xl bg-muted/30 border">
          <img src={`https://i.pravatar.cc/100?img=15`} className="w-7 h-7 rounded-full shrink-0" alt=""/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <div className="text-sm mt-1">{c.content}</div>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={text} onChange={e=> setText(e.target.value)} placeholder="Add a comment... @mention" className="flex-1 h-9 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"/>
        <Button disabled={!text.trim()} onClick={()=> { addComment({ pageId, blockId: undefined, recordId: undefined, authorId: user.id, content: text, parentId: null } as any); setText('')}}>Send</Button>
      </div>
    </div>
  )
}

function PageVersionHistory({ pageId }: { pageId:string }) {
  return (
    <div className="rounded-2xl border p-4 bg-card">
      <div className="flex items-center gap-2 font-medium text-sm"><History size={16}/> Version history</div>
      <div className="text-xs text-muted-foreground mt-1">Autosaved versions. Restore any point in time.</div>
      <div className="mt-3 space-y-2">
        {[
          { v: 12, at: new Date().toLocaleString(), by: 'You' },
          { v: 11, at: new Date(Date.now()-3600000).toLocaleString(), by: 'You' },
          { v: 10, at: new Date(Date.now()-7200000).toLocaleString(), by: 'Alex' },
        ].map(item=> (
          <div key={item.v} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent text-sm">
            <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center font-mono text-xs">v{item.v}</span>
            <span className="flex-1">{item.at} • {item.by}</span>
            <Button variant="ghost" size="sm">Restore</Button>
          </div>
        ))}
      </div>
    </div>
  )
}

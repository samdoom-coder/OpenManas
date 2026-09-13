import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Search, Command, Bell, Share2, Star, MoreHorizontal, History, Sparkles, ChevronRight, Copy, FolderInput, Archive, Trash2, FileDown, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/utils'
import { PageIconInline } from '@/components/ui/pageIcon'
import { PresenceAvatars, CollabStatusDot } from '@/components/features/Presence'
import { openShare } from '@/components/features/ShareDialog'
import { openNotifications } from '@/components/features/NotificationCenter'
import { pageToMarkdown, pageToJson, exportFilename } from '@/lib/pageExport'
import { downloadFile } from '@/lib/csvUtils'
import { useToast } from '@/components/ui/toast'

export function Topbar() {
  const { pages, selectedPageId, selectedDatabaseId, databases, setCommandOpen, setSearchOpen, notifications, user } = useAppStore()
  const page = pages.find(p=> p.id===selectedPageId)
  const db = databases.find(d=> d.id===selectedDatabaseId)

  const breadcrumb = page ? getBreadcrumb(page, pages) : []

  const scrollToHistory = () => {
    const el = document.getElementById('page-history')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="h-[56px] border-b bg-card/50 backdrop-blur flex items-center gap-3 px-4 shrink-0 sticky top-0 z-20">
      <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 flex-1">
        {page ? breadcrumb.map((b, i)=> (
          <span key={b.id} className="flex items-center gap-1 truncate">
            {i>0 && <ChevronRight size={14} className="shrink-0"/>}
            <span className={i===breadcrumb.length-1 ? "text-foreground font-medium truncate flex items-center gap-1" : "hover:text-foreground cursor-pointer truncate flex items-center gap-1"}><PageIconInline page={b} /> {b.title}</span>
          </span>
        )) : db ? <span className="text-foreground font-medium flex items-center gap-2">▦ {db.name}</span> : <span className="text-foreground font-medium">Dashboard</span>}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="hidden md:flex items-center gap-1 mr-2">
          <span className="text-xs text-muted-foreground hidden lg:inline">Autosaved</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <CollabStatusDot />
        <PresenceAvatars />

        <button onClick={()=> setSearchOpen(true)} className="hidden sm:flex items-center gap-2 px-3 h-8 rounded-xl border bg-background hover:bg-accent text-sm text-muted-foreground">
          <Search size={14}/> Search <span className="ml-2 hidden lg:inline-flex items-center gap-1 border rounded-md px-1.5 py-0.5 text-xs">⌘K</span>
        </button>
        <Button variant="ghost" size="icon" onClick={()=> setCommandOpen(true)} title="Command palette (Ctrl+K)"><Command size={16}/></Button>

        {page && (
          <>
            <Button variant="ghost" size="icon" onClick={()=> useAppStore.getState().toggleFavorite(page.id)}><Star size={16} className={page.isFavorite ? "fill-amber-400 text-amber-400" : ""}/></Button>
            <Button variant="ghost" size="icon" title="Share" onClick={()=> openShare(page.id)}><Share2 size={16}/></Button>
            <Button variant="ghost" size="icon" title="Version history" onClick={scrollToHistory}><History size={16}/></Button>
            <PageMenu pageId={page.id} />
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex"><Sparkles size={14} className="mr-1"/> Ask AI</Button>
          </>
        )}

        <div className="relative">
          <Button variant="ghost" size="icon" title="Notifications" aria-label="Open notifications" onClick={() => openNotifications()}><Bell size={16}/></Button>
          {notifications.filter(n=>!n.read).length>0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] grid place-items-center rounded-full pointer-events-none">{notifications.filter(n=>!n.read).length}</span>}
        </div>
        {user?.avatar ? (
          <img src={user.avatar} alt="Profile picture" className="w-8 h-8 rounded-xl border object-cover" />
        ) : (
          <img src={`https://i.pravatar.cc/100?img=32`} alt="avatar" className="w-8 h-8 rounded-xl border object-cover" />
        )}
      </div>
    </div>
  )
}

/** Page ••• menu: duplicate, move, favorite, export, archive, trash. */
function PageMenu({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false)
  const [confirmTrash, setConfirmTrash] = useState(false)
  const { push } = useToast()
  const page = useAppStore((s) => s.pages.find((p) => p.id === pageId))

  const close = () => {
    setOpen(false)
    setConfirmTrash(false)
  }

  const act = (fn: () => void) => () => {
    fn()
    close()
  }

  const doDuplicate = () => {
    const s = useAppStore.getState()
    const before = s.pages.find((p) => p.id === pageId)
    s.duplicatePage(pageId)
    // Open the copy (newest page with the copied title).
    const copy = [...useAppStore.getState().pages].reverse().find((p) => p.title === `${before?.title} (copy)`)
    if (copy) useAppStore.getState().setSelectedPage(copy.id)
    push({ title: 'Page duplicated' })
  }

  const doMove = () => {
    window.dispatchEvent(new CustomEvent('openmanas:move-page', { detail: { pageId } }))
  }

  const doExport = (kind: 'md' | 'json') => {
    const s = useAppStore.getState()
    const p = s.pages.find((x) => x.id === pageId)
    if (!p) return
    if (kind === 'md') {
      downloadFile(exportFilename(p.title, 'md'), pageToMarkdown(p, s.blocks), 'text/markdown')
    } else {
      downloadFile(exportFilename(p.title, 'json'), pageToJson(p, s.blocks), 'application/json')
    }
    push({ title: kind === 'md' ? 'Exported as Markdown' : 'Exported as JSON' })
  }

  const doTrash = () => {
    if (!confirmTrash) {
      setConfirmTrash(true)
      return
    }
    useAppStore.getState().deletePage(pageId)
    push({ title: 'Moved to trash', desc: 'Restore it anytime from Trash.' })
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" title="Page actions" aria-label="Page actions" onClick={() => { setOpen((v) => !v); setConfirmTrash(false) }}>
        <MoreHorizontal size={16} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute right-0 top-full mt-2 z-40 w-60 rounded-xl border bg-popover shadow-xl p-1.5">
            <MenuItem icon={<Copy size={14} />} label="Duplicate" onClick={act(doDuplicate)} />
            <MenuItem icon={<FolderInput size={14} />} label="Move to…" onClick={act(doMove)} />
            <MenuItem
              icon={<Star size={14} className={page?.isFavorite ? 'fill-amber-400 text-amber-400' : ''} />}
              label={page?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={act(() => useAppStore.getState().toggleFavorite(pageId))}
            />
            <div className="my-1 border-t" />
            <MenuItem icon={<FileDown size={14} />} label="Export Markdown" onClick={act(() => doExport('md'))} />
            <MenuItem icon={<FileJson size={14} />} label="Export JSON" onClick={act(() => doExport('json'))} />
            <div className="my-1 border-t" />
            <MenuItem icon={<Archive size={14} />} label="Archive" onClick={act(() => useAppStore.getState().archivePage(pageId))} />
            {!confirmTrash ? (
              <MenuItem icon={<Trash2 size={14} />} label="Move to trash" danger onClick={doTrash} />
            ) : (
              <div className="p-1.5">
                <div className="text-xs text-muted-foreground px-1.5 pb-2">Move “{page?.title || 'Untitled'}” to trash?</div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmTrash(false)}>Keep</Button>
                  <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={act(doTrash)}>Trash</Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ icon, label, hint, danger, onClick }: { icon: React.ReactNode; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${danger ? 'text-red-600 hover:bg-red-500/10' : 'hover:bg-accent'}`}
    >
      <span className={danger ? '' : 'text-muted-foreground'}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  )
}

function getBreadcrumb(page: any, all: any[]) {
  const chain: any[] = []
  let cur: any = page
  while(cur) {
    chain.unshift(cur)
    cur = all.find(p=> p.id===cur.parentId)
  }
  // prepend workspace
  return chain
}

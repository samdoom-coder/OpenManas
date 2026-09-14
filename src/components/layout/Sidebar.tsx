import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import { isImageIcon } from '@/lib/avatar'
import { LayoutDashboard, Files, Database, Star, Clock, Share2, Trash2, LayoutTemplate, Settings, ChevronDown, Plus, Search, Sparkles, MoreHorizontal, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { PageIconInline } from '@/components/ui/pageIcon'

export const OPEN_SIDEBAR_EVENT = 'openmanas:open-sidebar'
export const openMobileSidebar = () => window.dispatchEvent(new CustomEvent(OPEN_SIDEBAR_EVENT))

export function Sidebar({ onNavigate, activeRoute }: { onNavigate?: (r:string)=>void, activeRoute?:string }) {
  const { sidebarCollapsed } = useAppStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const fn = () => setMobileOpen(true)
    window.addEventListener(OPEN_SIDEBAR_EVENT, fn)
    return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, fn)
  }, [])

  // Lock body scroll while drawer is open + close on Escape
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  const handleNavigate = (r: string) => {
    setMobileOpen(false)
    onNavigate?.(r)
  }

  const handleSelectPage = (id: string | null) => {
    setMobileOpen(false)
    if (id === null) {
      useAppStore.getState().setSelectedPage(null)
      useAppStore.getState().setSelectedDatabase(null as any)
      onNavigate?.('dashboard')
    } else {
      useAppStore.getState().setSelectedPage(id)
    }
  }

  const handleSelectDb = (id: string) => {
    setMobileOpen(false)
    useAppStore.getState().setSelectedDatabase(id)
  }

  return (
    <>
      {/* Desktop sidebar — hidden on mobile, drawer takes over */}
      <div className="hidden lg:flex shrink-0">
        {sidebarCollapsed ? <CollapsedRail /> : <SidebarPanel onNavigate={onNavigate} activeRoute={activeRoute} />}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Workspace menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[86vw] max-w-[320px] bg-card border-r shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left duration-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <SidebarPanel
              onNavigate={handleNavigate}
              activeRoute={activeRoute}
              onSelectPage={handleSelectPage}
              onSelectDatabase={handleSelectDb}
              onClose={() => setMobileOpen(false)}
              isMobile
            />
          </div>
        </div>
      )}
    </>
  )
}

function CollapsedRail() {
  const { toggleSidebar } = useAppStore()
  return (
    <div className="w-[56px] border-r bg-card hidden lg:flex flex-col items-center py-4 gap-3 shrink-0">
      <button onClick={toggleSidebar} className="w-8 h-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">⬢</button>
      <div className="w-6 h-px bg-border my-1" />
      <button className="p-2 rounded-xl hover:bg-accent" aria-label="Dashboard"><LayoutDashboard size={18}/></button>
      <button className="p-2 rounded-xl hover:bg-accent" aria-label="Files"><Files size={18}/></button>
      <button className="p-2 rounded-xl hover:bg-accent" aria-label="Databases"><Database size={18}/></button>
    </div>
  )
}

function SidebarPanel({ onNavigate, activeRoute, onSelectPage, onSelectDatabase, onClose, isMobile }: {
  onNavigate?: (r:string)=>void, activeRoute?:string,
  onSelectPage?: (id: string | null) => void,
  onSelectDatabase?: (id: string) => void,
  onClose?: () => void,
  isMobile?: boolean,
}) {
  const { pages, databases, selectedPageId, selectedDatabaseId, setSelectedPage, setSelectedDatabase, createPage, workspace, toggleSidebar, user } = useAppStore()
  const safePages = Array.isArray(pages) ? pages.filter(Boolean) : []
  const safeDatabases = Array.isArray(databases) ? databases.filter(Boolean) : []
  const favorites = safePages.filter(p=>p.isFavorite && !p.isTrashed)
  const favDatabases = safeDatabases.filter(d=> d.isFavorite)
  const recent = [...safePages].filter(p=>!p.isTrashed).sort((a,b)=> new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0,5)
  const tree = buildTree(safePages)

  const goPage = (id: string | null) => {
    if (onSelectPage) onSelectPage(id)
    else if (id === null) setSelectedPage(null)
    else setSelectedPage(id)
  }
  const goDb = (id: string) => {
    if (onSelectDatabase) onSelectDatabase(id)
    else setSelectedDatabase(id)
  }

  return (
    <div className={isMobile ? "flex flex-col h-full min-h-0 w-full overflow-hidden" : "w-[280px] border-r bg-card flex flex-col shrink-0 overflow-hidden h-screen sticky top-0"}>
      <div className="h-[56px] flex items-center gap-3 px-3 border-b shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center text-white font-bold text-sm overflow-hidden shrink-0">
          {isImageIcon(workspace.icon) ? (
            <img src={workspace.icon} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            workspace.icon || '⬢'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{workspace?.name || 'Workspace'}</div>
          <div className="text-xs text-muted-foreground truncate">{user?.name || 'Local'} • {safePages.length} pages</div>
        </div>
        {isMobile ? (
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent min-w-[44px] min-h-[44px] grid place-items-center" aria-label="Close menu"><X size={18}/></button>
        ) : (
          <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-accent" aria-label="Collapse sidebar"><MoreHorizontal size={16}/></button>
        )}
      </div>

      <div className="p-2 flex-1 overflow-y-auto space-y-5 overscroll-contain">
        <div className="space-y-1">
          <button onClick={()=> goPage(null)} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent transition-colors", !selectedPageId && !selectedDatabaseId ? "bg-accent font-medium" : "text-muted-foreground")}>
            <LayoutDashboard size={16}/> Dashboard
          </button>
          <button onClick={()=> { onClose?.(); useAppStore.getState().setSearchOpen(true) }} className="w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent text-muted-foreground">
            <Search size={16}/> Search <span className="ml-auto text-xs border rounded-md px-1.5 py-0.5 hidden sm:inline">⌘K</span>
          </button>
          <button onClick={()=> { onClose?.(); useAppStore.getState().setCommandOpen(true) }} className="w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent text-muted-foreground">
            <Sparkles size={16}/> Ask AI <span className="ml-auto text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full">BETA</span>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Pages</span>
            <button onClick={()=> createPage('Untitled')} className="p-2 rounded-lg hover:bg-accent min-w-[36px] min-h-[36px] grid place-items-center" aria-label="New page"><Plus size={14}/></button>
          </div>
          <div className="space-y-0.5">
            {tree.filter(n=> !n.parentId && !n.isTrashed).map(node => (
              <PageTreeNode key={node.id} node={node} tree={tree} depth={0} onNavigateMobile={onClose} />
            ))}
            {tree.filter(n=> !n.parentId && !n.isTrashed).length===0 && <div className="px-2.5 py-3 text-xs text-muted-foreground rounded-xl border border-dashed">No pages yet — tap + to create one</div>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Databases</span>
            <button onClick={()=> useAppStore.getState().createDatabase('New Database')} className="p-2 rounded-lg hover:bg-accent min-w-[36px] min-h-[36px] grid place-items-center" aria-label="New database"><Plus size={14}/></button>
          </div>
          <div className="space-y-0.5">
            {safeDatabases.map(db=> (
              <button key={db.id} onClick={()=> goDb(db.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent", selectedDatabaseId===db.id ? "bg-accent font-medium" : "text-muted-foreground")}>
                <span className="w-5 text-center shrink-0">{db.icon || <Database size={14} className="mx-auto"/>}</span>
                <span className="truncate flex-1 text-left">{db.name}</span>
                {db.isFavorite && <Star size={12} className="text-amber-500 fill-amber-400 shrink-0"/>}
                <span className="text-xs bg-muted px-1.5 rounded-md shrink-0">{db.properties.length}</span>
              </button>
            ))}
            {safeDatabases.length===0 && <div className="px-2.5 py-2 text-xs text-muted-foreground rounded-xl border border-dashed">No databases yet</div>}
          </div>
        </div>

        <div>
          <div className="px-2 mb-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Favorites</div>
          {favorites.length===0 && favDatabases.length===0 ? <div className="px-2.5 py-2 text-xs text-muted-foreground rounded-xl border border-dashed">No favorites yet</div> :
            <div className="space-y-0.5">{favorites.map(p=> (
              <button key={p.id} onClick={()=> goPage(p.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent truncate", selectedPageId===p.id? "bg-accent":"")}>
                <Star size={14} className="text-amber-500 shrink-0"/><span className="truncate">{p.title}</span>
              </button>
            ))}
            {favDatabases.map(d=> (
              <button key={d.id} onClick={()=> goDb(d.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent truncate", selectedDatabaseId===d.id? "bg-accent":"")}>
                <Star size={14} className="text-amber-500 shrink-0"/><span className="truncate">{d.icon ? `${d.icon} ${d.name}` : d.name}</span>
              </button>
            ))}</div>
          }
        </div>

        <div>
          <div className="px-2 mb-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Recent</div>
          <div className="space-y-0.5">{recent.map(p=> (
            <button key={p.id} onClick={()=> goPage(p.id)} className="w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent text-muted-foreground truncate">
              <Clock size={14} className="shrink-0"/><span className="truncate">{p.title}</span>
            </button>
          ))}</div>
        </div>

        <div className="space-y-1 pt-2 border-t pb-2">
          <button onClick={()=> onNavigate?.('shared')} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent", activeRoute==='shared' ? "bg-accent font-medium" : "text-muted-foreground")}><Share2 size={16}/> Shared</button>
          <button onClick={()=> onNavigate?.('templates')} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent", activeRoute==='templates' ? "bg-accent font-medium" : "text-muted-foreground")}><LayoutTemplate size={16}/> Templates</button>
          <button onClick={()=> onNavigate?.('files')} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent", activeRoute==='files' ? "bg-accent font-medium" : "text-muted-foreground")}><Files size={16}/> Files</button>
          <button onClick={()=> onNavigate?.('graph')} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent", activeRoute==='graph' ? "bg-accent font-medium" : "text-muted-foreground")}><Database size={16}/> Graph</button>
          <button onClick={()=> onNavigate?.('trash')} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent", activeRoute==='trash' ? "bg-accent font-medium" : "text-muted-foreground")}><Trash2 size={16}/> Trash</button>
          <button onClick={()=> onNavigate?.('settings')} className={cn("w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] rounded-xl text-sm hover:bg-accent", activeRoute==='settings' ? "bg-accent font-medium" : "text-muted-foreground")}><Settings size={16}/> Settings</button>
        </div>
      </div>

      <div className="p-3 border-t space-y-2 shrink-0" style={{ paddingBottom: isMobile ? 'max(0.75rem, env(safe-area-inset-bottom))' : undefined }}>
        <AccountRow onNavigate={onNavigate} />
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-3 text-white">
          <div className="text-sm font-semibold flex items-center gap-1"><Sparkles size={14}/> OpenManas AI</div>
          <div className="text-xs opacity-80 mt-1">Ask anything across your workspace. Try “summarize my tasks”.</div>
          <button onClick={()=> { onClose?.(); useAppStore.getState().setCommandOpen(true) }} className="mt-2 w-full bg-white text-violet-700 rounded-xl py-2 min-h-[40px] text-xs font-semibold">Open AI Bar — ⌘J</button>
        </div>
      </div>
    </div>
  )
}

function buildTree(pages: any[]) {
  return pages
}

function AccountRow({ onNavigate }: { onNavigate?: (r: string) => void }) {
  const { user, token, backendMode } = useAppStore()
  const loggedIn = !!token
  return (
    <button
      onClick={()=> onNavigate?.('auth')}
      title={loggedIn ? 'Account' : 'Sign in'}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 min-h-[52px] rounded-xl hover:bg-accent text-left"
    >
      <span className="w-8 h-8 rounded-xl bg-violet-500/15 grid place-items-center font-semibold text-violet-600 shrink-0 overflow-hidden">
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="w-8 h-8 rounded-xl object-cover" />
        ) : (
          (user?.name || user?.email || '?').slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{loggedIn ? (user?.name || 'Account') : 'Local demo'}</span>
        <span className="block text-[11px] text-muted-foreground truncate">
          {loggedIn ? `${user?.email || ''} • server` : backendMode === 'server' ? 'Server session' : 'Sign in to sync →'}
        </span>
      </span>
    </button>
  )
}

function PageTreeNode({ node, tree, depth, onNavigateMobile }: { node: any, tree: any[], depth: number, onNavigateMobile?: () => void }) {
  const { selectedPageId, setSelectedPage, createPage, pages } = useAppStore()
  const safePages = Array.isArray(pages) ? pages : []
  const children = safePages.filter(p=> p && p.parentId===node.id && !p.isTrashed)
  const [open, setOpen] = useState(true)
  const isActive = selectedPageId===node.id
  return (
    <div>
      <div className={cn("group flex items-center gap-1 px-2 py-2 min-h-[40px] rounded-xl text-sm hover:bg-accent cursor-pointer", isActive && "bg-accent font-medium")} style={{ paddingLeft: 8 + depth*14 }}>
        {children.length>0 ? <button onClick={()=>setOpen(!open)} className="p-1.5 -m-0.5 rounded hover:bg-black/5 min-w-[32px] min-h-[32px] grid place-items-center" aria-label={open ? 'Collapse' : 'Expand'}><ChevronDown size={12} className={cn("transition-transform", !open && "-rotate-90")}/></button> : <span className="w-3"/>}
        <span className="text-xs"><PageIconInline page={node} /></span>
        <span className="truncate flex-1 min-w-0" onClick={()=>{ setSelectedPage(node.id); onNavigateMobile?.() }}>{node.title}</span>
        <button onClick={()=> createPage('Untitled', node.id)} className="sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded min-w-[32px] min-h-[32px] grid place-items-center hover:bg-white/10" aria-label="Add subpage"><Plus size={12}/></button>
      </div>
      {open && children.map(c=> <PageTreeNode key={c.id} node={c} tree={tree} depth={depth+1} onNavigateMobile={onNavigateMobile} />)}
    </div>
  )
}

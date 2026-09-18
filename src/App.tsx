import { useAppStore, flushPersist } from '@/stores/appStore'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { CommandPalette, GlobalSearch } from '@/components/layout/CommandPalette'
import { Dashboard } from '@/pages/Dashboard'
import { PageView } from '@/pages/PageView'
import { DatabasePage } from '@/pages/DatabasePage'
import { Settings } from '@/pages/Settings'
import { Auth } from '@/pages/Auth'
import { SharedPage } from '@/pages/SharedPage'
import { ShareDialog } from '@/components/features/ShareDialog'
import { NotificationCenter } from '@/components/features/NotificationCenter'
import { resolveShareToken, flushPushes } from '@/lib/sync'
import { Toaster, useToast } from '@/components/ui/toast'
import { useState, useEffect, useRef } from 'react'
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import { pathForRouteName, pagePath, databasePath, joinPath, routeNameForPath } from '@/lib/routes'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Search, Plus, LayoutTemplate, Settings as SettingsIcon } from 'lucide-react'
import { templatesSeed } from '@/data/seed'
import { Onboarding } from '@/components/features/Onboarding'
import { KnowledgeGraphView, buildGraph } from '@/components/features/KnowledgeGraph'
import { FileManager } from '@/components/features/FileManager'
import { ErrorBoundary } from '@/components/ui/errorBoundary'

export default function App() {
  const { selectedPageId, selectedDatabaseId } = useAppStore()
  const sessionToken = useAppStore((s) => s.token)
  const navigate = useNavigate()
  const location = useLocation()
  const activeRoute = routeNameForPath(location.pathname)
  const [showOnboarding, setShowOnboarding] = useState(()=> !localStorage.getItem('openmanas_onboarded'))

  // Slice 2: with a stored session, validate it once on boot (expired JWTs
  // sign out instead of silently serving another identity's data), then pull
  // shared state. Offline → session is kept for later.
  useEffect(()=> {
    if (!useAppStore.getState().token) return
    void (async () => {
      try { await useAppStore.getState().validateSession() } catch { /* offline */ }
      try { await useAppStore.getState().pullFromServer() } catch { /* pull reports via syncStatus */ }
    })()
  }, [])
  // Flush pending autosave + server pushes when the tab hides/closes, so a
  // fast edit → reload can't lose the last change (autosave is debounced
  // 400ms, block pushes 1000ms — a reload inside that window used to drop
  // the edit, and the boot pull then overwrote it with stale server state).
  useEffect(()=> {
    const onHide = () => {
      try { flushPersist() } catch { /* noop */ }
      try { flushPushes() } catch { /* noop */ }
    }
    const onVis = () => { if (document.visibilityState === 'hidden') onHide() }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVis)
    return ()=> {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  // Slice 3: after sign-in, consume a pending invite link.
  useEffect(()=> {
    if (!sessionToken) return
    let t: string | null = null
    try { t = localStorage.getItem('openmanas_pending_share'); localStorage.removeItem('openmanas_pending_share') } catch { /* noop */ }
    if (t) void joinShare(t)
  }, [sessionToken])
  // Slice 3: legacy invite-link hash (#/join/<token>) → canonical /join/:token
  // route. Logged in → open the page in the workspace; logged out →
  // read-only public preview (no sign-in wall).
  useEffect(()=> {
    const m = window.location.hash.match(/^#\/join\/([a-f0-9]+)/i)
    if (!m) return
    const t = m[1]
    window.location.hash = ''
    if (useAppStore.getState().token) void joinShare(t)
    else {
      try { localStorage.setItem('openmanas_pending_share', t) } catch { /* noop */ }
      navigate(joinPath(t), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Legacy name-based navigation (Sidebar/BottomNav/Auth) → router paths. */
  const navigateName = (r: string) => {
    // clear selections when navigating to non-page/db routes
    if (['dashboard','templates','trash','files','graph','shared','settings','auth','join'].includes(r)) {
      useAppStore.getState().setSelectedPage(null)
      useAppStore.getState().setSelectedDatabase(null)
    }
    navigate(pathForRouteName(r))
  }

  // URL → store: deep links, bookmarks and back/forward select the page/db.
  // Static routes intentionally leave the selection alone (matches the old
  // behavior where boot kept the restored selection while showing dashboard).
  const pageIdFromPath = location.pathname.startsWith('/page/')
    ? decodeURIComponent(location.pathname.slice('/page/'.length))
    : null
  const dbIdFromPath = location.pathname.startsWith('/db/')
    ? decodeURIComponent(location.pathname.slice('/db/'.length))
    : null
  useEffect(()=> {
    if (pageIdFromPath && useAppStore.getState().selectedPageId !== pageIdFromPath) {
      useAppStore.getState().setSelectedPage(pageIdFromPath)
    } else if (dbIdFromPath && useAppStore.getState().selectedDatabaseId !== dbIdFromPath) {
      useAppStore.getState().setSelectedDatabase(dbIdFromPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Store → URL: any selection change (sidebar, palette, dashboard, graph…)
  // pushes the deep link. Skipped on first render so a boot on `/` keeps
  // showing the dashboard (old behavior) instead of jumping to the restored
  // selection. Reads fresh state so a same-commit URL→store sync wins.
  const firstRender = useRef(true)
  useEffect(()=> {
    if (firstRender.current) { firstRender.current = false; return }
    const s = useAppStore.getState()
    if (s.selectedDatabaseId && location.pathname !== databasePath(s.selectedDatabaseId)) {
      navigate(databasePath(s.selectedDatabaseId))
    } else if (s.selectedPageId && location.pathname !== pagePath(s.selectedPageId)) {
      navigate(pagePath(s.selectedPageId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId, selectedDatabaseId])

  // autosave indicator
  const [saving, setSaving] = useState(false)
  useEffect(()=> {
    const unsub = useAppStore.subscribe(()=> {
      setSaving(true)
      const t = setTimeout(()=> setSaving(false), 800)
      return ()=> clearTimeout(t)
    })
    return ()=> unsub()
  }, [])

  return (
    <ErrorBoundary>
    <div className="min-h-[100dvh] bg-background text-foreground flex overflow-x-clip">
      <Sidebar onNavigate={navigateName} activeRoute={activeRoute} />
      <div className="flex-1 min-w-0 flex flex-col h-[100dvh] overflow-hidden">
        <Topbar />
        <div className="flex-1 overflow-auto overscroll-contain bg-[radial-gradient(ellipse_at_top,_rgba(120,119,198,0.08),transparent_60%)] pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard onNavigate={navigateName as any} />} />
            <Route path="/page/:id" element={<PageRoute />} />
            <Route path="/db/:id" element={<DatabaseRoute />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/auth" element={<Auth onNavigate={navigateName as any} />} />
            <Route path="/join/:token" element={<JoinRoute />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/shared" element={<Shared />} />
            <Route path="/files" element={<div className="max-w-[900px] mx-auto p-4 sm:p-6 md:p-8"><h1 className="text-xl sm:text-2xl font-bold mb-4">Files</h1><FileManager/></div>} />
            <Route path="/graph" element={<GraphRoute />} />
            <Route path="*" element={<NotFound onBack={()=> navigate('/')} />} />
          </Routes>
        </div>
        {saving && <div className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 bg-popover border shadow-lg rounded-full px-4 py-1.5 text-xs z-40">Saving...</div>}
      </div>

      <CommandPalette />
      <GlobalSearch />
      <ShareDialog />
      <NotificationCenter />
      <Toaster />
      <Onboarding open={showOnboarding} onClose={()=> { setShowOnboarding(false); localStorage.setItem('openmanas_onboarded','1')}} />

      <div className="fixed bottom-4 right-4 hidden lg:flex items-center gap-2">
        <button onClick={()=> useAppStore.getState().setCommandOpen(true)} className="px-3 py-2 rounded-xl bg-card border shadow text-xs">⌘K Commands</button>
      </div>

      <BottomNav route={activeRoute} setRoute={navigateName} />
    </div>
    </ErrorBoundary>
  )
}

/** /page/:id — syncs the store selection, renders the editor or a 404 card. */
function PageRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const page = useAppStore((s) => (id ? s.pages.find((p) => p.id === id) : undefined))
  useEffect(()=> {
    if (id && useAppStore.getState().selectedPageId !== id) {
      useAppStore.getState().setSelectedPage(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (!id) return null
  if (!page) return <NotFound label="Page not found" onBack={()=> navigate('/')} />
  return <PageView pageId={id} />
}

/** /db/:id — syncs the store selection, renders the database or a 404 card. */
function DatabaseRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = useAppStore((s) => (id ? s.databases.find((d) => d.id === id) : undefined))
  useEffect(()=> {
    if (id && useAppStore.getState().selectedDatabaseId !== id) {
      useAppStore.getState().setSelectedDatabase(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (!id) return null
  if (!db) return <NotFound label="Database not found" onBack={()=> navigate('/')} />
  return <DatabasePage databaseId={id} />
}

/** /join/:token — logged in → open the page; logged out → public preview. */
function JoinRoute() {
  const { token } = useParams()
  const navigate = useNavigate()
  useEffect(()=> {
    if (!token) return
    if (useAppStore.getState().token) void joinShare(token)
    else {
      try { localStorage.setItem('openmanas_pending_share', token) } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  if (!token) return <NotFound label="Invalid invite link" onBack={()=> navigate('/')} />
  if (useAppStore((s) => s.token)) return null
  return <SharedPage token={token} onSignIn={()=> navigate('/auth')} />
}

function NotFound({ label, onBack }: { label?: string; onBack: () => void }) {
  return (
    <div className="max-w-[600px] mx-auto p-4 sm:p-6 md:p-8">
      <div className="py-16 text-center border rounded-2xl border-dashed text-muted-foreground text-sm px-4 space-y-3">
        <div>{label ?? 'Page not found'}</div>
        <Button size="sm" variant="outline" onClick={onBack}>Back to dashboard</Button>
      </div>
    </div>
  )
}

async function joinShare(t: string) {
  try {
    const r = await resolveShareToken(t)
    useAppStore.getState().setSelectedPage(r.pageId)
  } catch {
    // invalid/revoked link — stay where we are
  }
}

function GraphRoute() {  const { pages, databases, blocks, records, setSelectedPage, setSelectedDatabase } = useAppStore()
  const graph = buildGraph(pages, databases, blocks, records)
  return (
    <div className="max-w-[1100px] mx-auto p-4 sm:p-6 md:p-8">
      <h1 className="text-xl sm:text-2xl font-bold mb-4">Knowledge Graph</h1>
      <KnowledgeGraphView
        {...graph}
        onSelectNode={(n) => {
          if (n.type === 'page') setSelectedPage(n.id)
          else if (n.type === 'database') setSelectedDatabase(n.id)
          else if (n.type === 'record') {
            const rec = records.find((r) => r.id === n.id)
            if (rec) setSelectedDatabase(rec.databaseId)
          }
        }}
      />
    </div>
  )
}

function BottomNav({ route, setRoute }: { route:string, setRoute:(r:any)=>void }) {
  const item = (active: boolean) => `min-w-[48px] min-h-[48px] px-3 grid place-items-center rounded-xl transition-colors ${active ? 'bg-accent text-foreground' : 'text-muted-foreground'}`;
  return (
    <nav aria-label="Primary" className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t flex items-center justify-around px-2 pt-1" style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
      <button aria-label="Dashboard" onClick={()=> setRoute('dashboard')} className={item(route==='dashboard')}><LayoutDashboard size={20}/></button>
      <button aria-label="Search" onClick={()=> useAppStore.getState().setSearchOpen(true)} className={item(false)}><Search size={20}/></button>
      <button aria-label="New page" onClick={()=> useAppStore.getState().createPage('Untitled')} className="w-12 h-12 -mt-4 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg border-4 border-background"><Plus size={22}/></button>
      <button aria-label="Templates" onClick={()=> setRoute('templates')} className={item(route==='templates')}><LayoutTemplate size={20}/></button>
      <button aria-label="Settings" onClick={()=> setRoute('settings')} className={item(route==='settings')}><SettingsIcon size={20}/></button>
    </nav>
  )
}

function Templates() {
  const createPageFromTemplate = useAppStore(s => s.createPageFromTemplate)
  return (
    <div className="max-w-[1000px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">Templates</h1>
      <p className="text-sm text-muted-foreground">Start from a template. Reusable block structures.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {templatesSeed.map(t=> (
          <div key={t.name} className="rounded-2xl border bg-card p-4 sm:p-5 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 grid place-items-center text-lg">{t.icon}</div>
            <div className="font-semibold mt-3">{t.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
            <div className="flex items-center gap-2 mt-3">
              <div className="text-xs border rounded-full px-2 py-1 inline-block">{t.category}</div>
              <div className="text-[11px] text-muted-foreground ml-auto">{t.blocks.length} blocks</div>
            </div>
            <Button size="sm" className="w-full mt-4 min-h-[40px]" onClick={()=> createPageFromTemplate(t.name)}>Use template</Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Shared() {
  const { pages } = useAppStore()
  const shared = pages.filter(p=> p.isShared)
  return (
    <div className="max-w-[900px] mx-auto p-4 sm:p-6 md:p-8 space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Shared</h1>
      <p className="text-sm text-muted-foreground">Pages shared with workspace or public link. Manage sharing via page ••• → Share.</p>
      {shared.length===0 ? <div className="py-12 text-center border rounded-2xl border-dashed text-muted-foreground text-sm px-4">No shared pages yet. Open a page and click Share.</div> :
        <div className="space-y-2">{shared.map(p=> <div key={p.id} className="p-3 rounded-xl border bg-card flex items-center gap-3 min-w-0"><span className="flex-1 font-medium truncate min-w-0">{p.title}</span><span className="text-xs border rounded-full px-2 py-1 shrink-0">{p.shareMode||'workspace'}</span></div>)}</div>
      }
    </div>
  )
}

function Trash() {
  const { pages, updatePage, deletePagePermanently, emptyTrash } = useAppStore()
  const { push } = useToast()
  const trashed = pages.filter(p=> p.isTrashed)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  return (
    <div className="max-w-[800px] mx-auto p-4 sm:p-6 md:p-8 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold flex-1">Trash</h1>
        {trashed.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const n = emptyTrash()
              push({ title: n === 0 ? 'Trash already empty' : `Permanently deleted ${n} page(s)` })
            }}
          >
            Empty trash
          </Button>
        )}
      </div>
      {trashed.length===0 ? <div className="py-16 text-center border rounded-2xl border-dashed text-muted-foreground text-sm px-4">Trash is empty</div> :
        <div className="space-y-2">
          {trashed.map(p=> (
            <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl border bg-card">
              <span className="flex-1 font-medium truncate min-w-0">{p.title}</span>
              {confirmId === p.id ? (
                <span className="flex gap-2 shrink-0 items-center">
                  <span className="text-xs text-muted-foreground">Delete forever?</span>
                  <Button size="sm" variant="outline" onClick={()=> setConfirmId(null)}>Keep</Button>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={()=> { deletePagePermanently(p.id); setConfirmId(null); push({ title: 'Page permanently deleted' }) }}
                  >
                    Delete
                  </Button>
                </span>
              ) : (
                <span className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={()=> updatePage(p.id, { isTrashed:false })}>Restore</Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={()=> setConfirmId(p.id)}>Delete</Button>
                </span>
              )}
            </div>
          ))}
        </div>
      }
    </div>
  )
}

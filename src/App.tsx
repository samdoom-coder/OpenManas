import { useAppStore } from '@/stores/appStore'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { CommandPalette, GlobalSearch } from '@/components/layout/CommandPalette'
import { Dashboard } from '@/pages/Dashboard'
import { PageView } from '@/pages/PageView'
import { DatabasePage } from '@/pages/DatabasePage'
import { Settings } from '@/pages/Settings'
import { Toaster } from '@/components/ui/toast'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { templatesSeed } from '@/data/seed'
import { Onboarding } from '@/components/features/Onboarding'
import { KnowledgeGraphView, buildGraph } from '@/components/features/KnowledgeGraph'
import { FileManager } from '@/components/features/FileManager'

export default function App() {
  const { selectedPageId, selectedDatabaseId, pages, databases, setSelectedPage, setSelectedDatabase } = useAppStore()
  const [route, setRoute] = useState<'dashboard'|'page'|'database'|'settings'|'templates'|'trash'|'files'|'graph'|'shared'>('dashboard')
  const [showOnboarding, setShowOnboarding] = useState(()=> !localStorage.getItem('nexus_onboarded'))

  const navigate = (r: string) => {
    // clear selections when navigating to non-page/db routes
    if (['dashboard','templates','trash','files','graph','shared','settings'].includes(r)) {
      setSelectedPage(null); setSelectedDatabase(null)
    }
    setRoute(r as any)
  }

  useEffect(()=> {
    if (selectedDatabaseId) setRoute('database')
    else if (selectedPageId) setRoute('page')
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
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar onNavigate={navigate} activeRoute={route} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <div className="flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top,_rgba(120,119,198,0.08),transparent_60%)]">
          {route==='dashboard' && <Dashboard onNavigate={navigate as any} />}
          {route==='page' && selectedPageId && <PageView pageId={selectedPageId} />}
          {route==='database' && selectedDatabaseId && <DatabasePage databaseId={selectedDatabaseId} />}
          {route==='settings' && <Settings />}
          {route==='templates' && <Templates />}
          {route==='trash' && <Trash />}
          {route==='shared' && <Shared />}
          {route==='files' && <div className="max-w-[900px] mx-auto p-6 md:p-8"><h1 className="text-2xl font-bold mb-4">Files</h1><FileManager/></div>}
          {route==='graph' && <div className="max-w-[1000px] mx-auto p-6 md:p-8"><h1 className="text-2xl font-bold mb-4">Knowledge Graph</h1><KnowledgeGraphView {...buildGraph(pages, databases)}/></div>}
        </div>
        {saving && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-popover border shadow-lg rounded-full px-4 py-1.5 text-xs">Saving...</div>}
      </div>

      <CommandPalette />
      <GlobalSearch />
      <Toaster />
      <Onboarding open={showOnboarding} onClose={()=> { setShowOnboarding(false); localStorage.setItem('nexus_onboarded','1')}} />

      <div className="fixed bottom-4 right-4 hidden lg:flex items-center gap-2">
        <button onClick={()=> useAppStore.getState().setCommandOpen(true)} className="px-3 py-2 rounded-xl bg-card border shadow text-xs">⌘K Commands</button>
      </div>

      <BottomNav route={route} setRoute={setRoute} />
    </div>
  )
}

function BottomNav({ route, setRoute }: { route:string, setRoute:(r:any)=>void }) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t flex items-center justify-around p-2">
      <button onClick={()=> setRoute('dashboard')} className={`p-2 rounded-xl ${route==='dashboard' ? 'bg-accent' : ''}`}>◈</button>
      <button onClick={()=> useAppStore.getState().setSearchOpen(true)} className="p-2">⌕</button>
      <button onClick={()=> useAppStore.getState().createPage('Untitled')} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">+</button>
      <button onClick={()=> setRoute('templates')} className={`p-2 ${route==='templates'?'bg-accent':''}`}>▦</button>
      <button onClick={()=> setRoute('settings')} className={`p-2 ${route==='settings'?'bg-accent':''}`}>⚙</button>
    </div>
  )
}

function Templates() {
  const createPageFromTemplate = useAppStore(s => s.createPageFromTemplate)
  return (
    <div className="max-w-[1000px] mx-auto p-6 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold">Templates</h1>
      <p className="text-sm text-muted-foreground">Start from a template. Reusable block structures.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templatesSeed.map(t=> (
          <div key={t.name} className="rounded-2xl border bg-card p-5 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 grid place-items-center text-lg">{t.icon}</div>
            <div className="font-semibold mt-3">{t.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
            <div className="flex items-center gap-2 mt-3">
              <div className="text-xs border rounded-full px-2 py-1 inline-block">{t.category}</div>
              <div className="text-[11px] text-muted-foreground ml-auto">{t.blocks.length} blocks</div>
            </div>
            <Button size="sm" className="w-full mt-4" onClick={()=> createPageFromTemplate(t.name)}>Use template</Button>
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
    <div className="max-w-[900px] mx-auto p-6 md:p-8 space-y-4">
      <h1 className="text-2xl font-bold">Shared</h1>
      <p className="text-sm text-muted-foreground">Pages shared with workspace or public link. Manage sharing via page ••• → Share.</p>
      {shared.length===0 ? <div className="py-12 text-center border rounded-2xl border-dashed text-muted-foreground">No shared pages yet. Open a page and click Share.</div> :
        <div className="space-y-2">{shared.map(p=> <div key={p.id} className="p-3 rounded-xl border bg-card flex items-center gap-3"><span className="flex-1 font-medium">{p.title}</span><span className="text-xs border rounded-full px-2 py-1">{p.shareMode||'workspace'}</span></div>)}</div>
      }
    </div>
  )
}

function Trash() {
  const { pages, updatePage } = useAppStore()
  const trashed = pages.filter(p=> p.isTrashed)
  return (
    <div className="max-w-[800px] mx-auto p-6 md:p-8 space-y-4">
      <h1 className="text-2xl font-bold">Trash</h1>
      {trashed.length===0 ? <div className="py-16 text-center border rounded-2xl border-dashed text-muted-foreground">Trash is empty</div> :
        <div className="space-y-2">
          {trashed.map(p=> (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <span className="flex-1 font-medium">{p.title}</span>
              <Button size="sm" variant="outline" onClick={()=> updatePage(p.id, { isTrashed:false })}>Restore</Button>
              <Button size="sm" variant="ghost">Delete</Button>
            </div>
          ))}
        </div>
      }
    </div>
  )
}

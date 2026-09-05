import { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { BlockRegistry } from '@/lib/blockRegistry'
import { buildDocs, semanticSearchDocs } from '@/lib/embeddings'
import { Search, FileText, Database, Plus, Trash2, Star, Sparkles, Settings, LayoutDashboard } from 'lucide-react'

export function CommandPalette() {
  const { commandOpen, setCommandOpen, pages, createPage, setSelectedPage, setSelectedDatabase, databases, toggleSidebar } = useAppStore()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)

  useEffect(()=> {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') { e.preventDefault(); setCommandOpen(!commandOpen) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='p' && !e.shiftKey) { e.preventDefault(); setCommandOpen(true) }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase()==='p') { e.preventDefault(); const p=createPage('Untitled'); setCommandOpen(false) }
      if (e.key==='Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [commandOpen])

  const commands = useMemo(()=> {
    const base = [
      { id: 'create-page', label: 'Create page', icon: FileText, action: ()=>{ createPage('Untitled'); setCommandOpen(false)} },
      { id: 'create-db', label: 'Create database', icon: Database, action: ()=>{ useAppStore.getState().createDatabase('New Database'); setCommandOpen(false)} },
      { id: 'toggle-sidebar', label: 'Toggle sidebar', icon: LayoutDashboard, action: ()=>{ toggleSidebar(); setCommandOpen(false)} },
      { id: 'open-settings', label: 'Open settings', icon: Settings, action: ()=> setCommandOpen(false)},
      { id: 'ask-ai', label: 'Ask AI — workspace Q&A', icon: Sparkles, action: ()=> setCommandOpen(false)},
    ]
    const pageCmds = pages.filter(p=>!p.isTrashed).map(p=> ({ id: `go-${p.id}`, label: `Go to ${p.title}`, icon: FileText, action: ()=>{ setSelectedPage(p.id); setCommandOpen(false)} }))
    const dbCmds = databases.map(d=> ({ id: `db-${d.id}`, label: `Open database ${d.name}`, icon: Database, action: ()=>{ setSelectedDatabase(d.id); setCommandOpen(false)} }))
    const slash = BlockRegistry.all().map(b=> ({ id: `slash-${b.type}`, label: `Insert ${b.label}`, icon: FileText, action: ()=> setCommandOpen(false)}))
    return [...base, ...pageCmds, ...dbCmds]
  }, [pages, databases])

  const filtered = useMemo(()=> {
    if (!q) return commands.slice(0,12)
    const lower = q.toLowerCase()
    return commands.filter(c=> c.label.toLowerCase().includes(lower)).slice(0,12)
  }, [q, commands])

  if (!commandOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=> setCommandOpen(false)} />
      <div className="relative w-full max-w-[640px] mx-4 bg-popover border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b">
          <Search size={18} className="text-muted-foreground"/>
          <input autoFocus value={q} onChange={e=>{setQ(e.target.value); setIdx(0)}} onKeyDown={e=> {
            if (e.key==='ArrowDown') { e.preventDefault(); setIdx(i=> Math.min(i+1, filtered.length-1))}
            if (e.key==='ArrowUp') { e.preventDefault(); setIdx(i=> Math.max(i-1, 0))}
            if (e.key==='Enter') { filtered[idx]?.action() }
          }} placeholder="Type a command or search..." className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
          <span className="text-xs border rounded-md px-1.5 py-1 text-muted-foreground">ESC</span>
        </div>
        <div className="p-2 max-h-[380px] overflow-auto">
          <div className="px-2 py-1 text-[11px] tracking-widest font-semibold text-muted-foreground uppercase">Commands</div>
          {filtered.map((c,i)=> (
            <button key={c.id} onClick={c.action} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left ${i===idx ? 'bg-accent' : 'hover:bg-accent/60'}`}>
              <c.icon size={16} className="text-muted-foreground"/>
              <span className="flex-1">{c.label}</span>
              {i===idx && <span className="text-xs text-muted-foreground">↵</span>}
            </button>
          ))}
          {filtered.length===0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">No results for “{q}”</div>}
        </div>
        <div className="px-3 py-2 border-t bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground">
          <span>↑↓ Navigate</span> <span>•</span> <span>↵ Select</span> <span>•</span> <span>⌘K to close</span>
        </div>
      </div>
    </div>
  )
}

export function GlobalSearch() {
  const { searchOpen, setSearchOpen, pages, blocks, records, setSelectedPage, setSelectedDatabase } = useAppStore()
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'keyword' | 'semantic'>('keyword')
  useEffect(()=> {
    const h = (e:KeyboardEvent)=> { if ((e.ctrlKey||e.metaKey)&& e.key.toLowerCase()==='k') { e.preventDefault(); setSearchOpen(!searchOpen) } }
    window.addEventListener('keydown', h); return ()=> window.removeEventListener('keydown', h)
  }, [searchOpen])
  const docs = useMemo(()=> buildDocs(pages, blocks, records), [pages, blocks, records])
  if (!searchOpen) return null
  const results = (()=> {
    if (!q) return []
    if (mode === 'semantic') {
      return semanticSearchDocs(q, docs, 10).map(s => {
        const action = s.kind === 'page'
          ? ()=>{ setSelectedPage(s.id); setSearchOpen(false) }
          : s.kind === 'block'
            ? ()=>{ const b = blocks.find(x=> x.id===s.id); const pg = b && pages.find(p=> p.id===b.pageId); if (pg) setSelectedPage(pg.id); setSearchOpen(false) }
            : ()=> setSearchOpen(false)
        const snippet = s.kind === 'page'
          ? (pages.find(p=> p.id===s.id)?.description || '')
          : s.text.slice(0, 80)
        return { id: s.id, title: s.title, type: s.kind[0].toUpperCase() + s.kind.slice(1), snippet, updatedAt: new Date().toISOString(), score: s.score, action }
      })
    }
    const lower=q.toLowerCase()
    const out: any[] = []
    pages.filter(p=> p.title.toLowerCase().includes(lower)).slice(0,5).forEach(p=> out.push({ id:p.id, title:p.title, type:'Page', snippet: p.description||'', updatedAt:p.updatedAt, action:()=>{ setSelectedPage(p.id); setSearchOpen(false)}}))
    blocks.filter(b=> b.content.toLowerCase().includes(lower)).slice(0,5).forEach(b=> out.push({ id:b.id, title: b.content.slice(0,40)||'Block', type:'Block', snippet: b.content.slice(0,80), updatedAt:b.updatedAt, action:()=>{ const pg=pages.find(p=>p.id===b.pageId); if(pg) setSelectedPage(pg.id); setSearchOpen(false)}}))
    records.filter(r=> Object.values(r.properties).some(v=> String(v).toLowerCase().includes(lower))).slice(0,5).forEach(r=> out.push({ id:r.id, title: String(Object.values(r.properties)[0]), type:'Record', snippet: JSON.stringify(r.properties).slice(0,80), updatedAt:r.updatedAt, action:()=> setSearchOpen(false)}))
    return out
  })()
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=> setSearchOpen(false)} />
      <div className="relative w-full max-w-[640px] mx-4 bg-popover border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b">
          <Search size={18} className="text-muted-foreground"/>
          <input autoFocus value={q} onChange={e=> setQ(e.target.value)} placeholder={mode==='semantic' ? 'Describe what you need…' : 'Search pages, blocks, records...'} className="flex-1 bg-transparent outline-none"/>
          <div className="flex rounded-full border text-[11px] overflow-hidden shrink-0" role="tablist" aria-label="Search mode">
            {(['keyword', 'semantic'] as const).map(m=> (
              <button key={m} onClick={()=> setMode(m)} className={`px-2.5 py-1 capitalize ${mode===m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{m}</button>
            ))}
          </div>
        </div>
        <div className="p-2 max-h-[400px] overflow-auto">
          {results.length===0 && q && <div className="p-8 text-center text-sm text-muted-foreground">No results{mode==='semantic' ? ' — try different words' : ''}</div>}
          {!q && <div className="p-8 text-center text-sm text-muted-foreground">{mode==='semantic' ? 'Semantic search finds related content even without exact words' : 'Type to search across workspace'}</div>}
          {results.map(r=> (
            <button key={r.id} onClick={r.action} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-accent">
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary">{r.type}</span>
                <span className="font-medium text-sm truncate">{r.title}</span>
                {typeof r.score === 'number' && <span className="text-[11px] text-violet-600">{Math.round(r.score * 100)}%</span>}
                <span className="ml-auto text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString()}</span>
              </div>
              {r.snippet && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.snippet}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

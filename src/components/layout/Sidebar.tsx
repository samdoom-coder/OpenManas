import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Files, Database, Star, Clock, Share2, Trash2, LayoutTemplate, Settings, ChevronDown, Plus, Search, Sparkles, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { PageIconInline } from '@/components/ui/pageIcon'

export function Sidebar({ onNavigate, activeRoute }: { onNavigate?: (r:string)=>void, activeRoute?:string }) {
  const { pages, databases, selectedPageId, selectedDatabaseId, setSelectedPage, setSelectedDatabase, createPage, workspace, sidebarCollapsed, toggleSidebar, user } = useAppStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Projects: true, Knowledge: true })
  const favorites = pages.filter(p=>p.isFavorite && !p.isTrashed)
  const recent = [...pages].filter(p=>!p.isTrashed).sort((a,b)=> new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0,5)

  if (sidebarCollapsed) {
    return (
      <div className="w-[56px] border-r bg-card flex flex-col items-center py-4 gap-3 shrink-0">
        <button onClick={toggleSidebar} className="w-8 h-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">⬢</button>
        <div className="w-6 h-px bg-border my-1" />
        <button className="p-2 rounded-xl hover:bg-accent"><LayoutDashboard size={18}/></button>
        <button className="p-2 rounded-xl hover:bg-accent"><Files size={18}/></button>
        <button className="p-2 rounded-xl hover:bg-accent"><Database size={18}/></button>
      </div>
    )
  }

  const tree = buildTree(pages)

  return (
    <div className="w-[280px] border-r bg-card flex flex-col shrink-0 overflow-hidden">
      <div className="h-[56px] flex items-center gap-3 px-3 border-b shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center text-white font-bold text-sm">⬢</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{workspace.name}</div>
          <div className="text-xs text-muted-foreground truncate">{user.name} • {pages.length} pages</div>
        </div>
        <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-accent"><MoreHorizontal size={16}/></button>
      </div>

      <div className="p-2 flex-1 overflow-y-auto space-y-5">
        <div className="space-y-1">
          <button onClick={()=> setSelectedPage(null)} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm hover:bg-accent transition-colors", !selectedPageId && !selectedDatabaseId ? "bg-accent font-medium" : "text-muted-foreground")}>
            <LayoutDashboard size={16}/> Dashboard
          </button>
          <button onClick={()=> useAppStore.getState().setSearchOpen(true)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm hover:bg-accent text-muted-foreground">
            <Search size={16}/> Search <span className="ml-auto text-xs border rounded-md px-1.5 py-0.5">⌘K</span>
          </button>
          <button onClick={()=> useAppStore.getState().setCommandOpen(true)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm hover:bg-accent text-muted-foreground">
            <Sparkles size={16}/> Ask AI <span className="ml-auto text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full">BETA</span>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Pages</span>
            <button onClick={()=> createPage('Untitled')} className="p-1 rounded-lg hover:bg-accent"><Plus size={14}/></button>
          </div>
          <div className="space-y-0.5">
            {tree.filter(n=> !n.parentId && !n.isTrashed).map(node => (
              <PageTreeNode key={node.id} node={node} tree={tree} depth={0} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Databases</span>
            <button onClick={()=> useAppStore.getState().createDatabase('New Database')} className="p-1 rounded-lg hover:bg-accent"><Plus size={14}/></button>
          </div>
          <div className="space-y-0.5">
            {databases.map(db=> (
              <button key={db.id} onClick={()=> setSelectedDatabase(db.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent", selectedDatabaseId===db.id ? "bg-accent font-medium" : "text-muted-foreground")}>
                <Database size={14}/> {db.name}
                <span className="ml-auto text-xs bg-muted px-1.5 rounded-md">{db.properties.length}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="px-2 mb-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Favorites</div>
          {favorites.length===0 ? <div className="px-2.5 py-2 text-xs text-muted-foreground rounded-xl border border-dashed">No favorites yet</div> :
            <div className="space-y-0.5">{favorites.map(p=> (
              <button key={p.id} onClick={()=> setSelectedPage(p.id)} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent truncate", selectedPageId===p.id? "bg-accent":"")}>
                <Star size={14} className="text-amber-500"/>{p.title}
              </button>
            ))}</div>
          }
        </div>

        <div>
          <div className="px-2 mb-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Recent</div>
          <div className="space-y-0.5">{recent.map(p=> (
            <button key={p.id} onClick={()=> setSelectedPage(p.id)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent text-muted-foreground truncate">
              <Clock size={14}/>{p.title}
            </button>
          ))}</div>
        </div>

        <div className="space-y-1 pt-2 border-t">
          <button onClick={()=> onNavigate?.('shared')} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent", activeRoute==='shared' ? "bg-accent font-medium" : "text-muted-foreground")}><Share2 size={16}/> Shared</button>
          <button onClick={()=> onNavigate?.('templates')} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent", activeRoute==='templates' ? "bg-accent font-medium" : "text-muted-foreground")}><LayoutTemplate size={16}/> Templates</button>
          <button onClick={()=> onNavigate?.('files')} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent", activeRoute==='files' ? "bg-accent font-medium" : "text-muted-foreground")}><Files size={16}/> Files</button>
          <button onClick={()=> onNavigate?.('graph')} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent", activeRoute==='graph' ? "bg-accent font-medium" : "text-muted-foreground")}><Database size={16}/> Graph</button>
          <button onClick={()=> onNavigate?.('trash')} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent", activeRoute==='trash' ? "bg-accent font-medium" : "text-muted-foreground")}><Trash2 size={16}/> Trash</button>
          <button onClick={()=> onNavigate?.('settings')} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm hover:bg-accent", activeRoute==='settings' ? "bg-accent font-medium" : "text-muted-foreground")}><Settings size={16}/> Settings</button>
        </div>
      </div>

      <div className="p-3 border-t">
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-3 text-white">
          <div className="text-sm font-semibold flex items-center gap-1"><Sparkles size={14}/> OpenManas AI</div>
          <div className="text-xs opacity-80 mt-1">Ask anything across your workspace. Try “summarize my tasks”.</div>
          <button className="mt-2 w-full bg-white text-violet-700 rounded-xl py-1.5 text-xs font-semibold">Open AI Bar — ⌘J</button>
        </div>
      </div>
    </div>
  )
}

function buildTree(pages: any[]) {
  return pages
}

function PageTreeNode({ node, tree, depth }: { node: any, tree: any[], depth: number }) {
  const { selectedPageId, setSelectedPage, createPage, pages } = useAppStore()
  const children = pages.filter(p=> p.parentId===node.id && !p.isTrashed)
  const [open, setOpen] = useState(true)
  const isActive = selectedPageId===node.id
  return (
    <div>
      <div className={cn("group flex items-center gap-1 px-2 py-1.5 rounded-xl text-sm hover:bg-accent cursor-pointer", isActive && "bg-accent font-medium")} style={{ paddingLeft: 8 + depth*14 }}>
        {children.length>0 ? <button onClick={()=>setOpen(!open)} className="p-0.5 rounded hover:bg-black/5"><ChevronDown size={12} className={cn("transition-transform", !open && "-rotate-90")}/></button> : <span className="w-3"/>}
        <span className="text-xs"><PageIconInline page={node} /></span>
        <span className="truncate flex-1" onClick={()=>setSelectedPage(node.id)}>{node.title}</span>
        <button onClick={()=> createPage('Untitled', node.id)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded"><Plus size={12}/></button>
      </div>
      {open && children.map(c=> <PageTreeNode key={c.id} node={c} tree={tree} depth={depth+1} />)}
    </div>
  )
}

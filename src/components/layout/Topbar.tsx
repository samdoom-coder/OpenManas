import { useAppStore } from '@/stores/appStore'
import { Search, Command, Bell, Share2, Star, MoreHorizontal, History, Sparkles, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/utils'
import { PageIconInline } from '@/components/ui/pageIcon'

export function Topbar() {
  const { pages, selectedPageId, selectedDatabaseId, databases, setCommandOpen, setSearchOpen, notifications } = useAppStore()
  const page = pages.find(p=> p.id===selectedPageId)
  const db = databases.find(d=> d.id===selectedDatabaseId)

  const breadcrumb = page ? getBreadcrumb(page, pages) : []

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

        <button onClick={()=> setSearchOpen(true)} className="hidden sm:flex items-center gap-2 px-3 h-8 rounded-xl border bg-background hover:bg-accent text-sm text-muted-foreground">
          <Search size={14}/> Search <span className="ml-2 hidden lg:inline-flex items-center gap-1 border rounded-md px-1.5 py-0.5 text-xs">⌘K</span>
        </button>
        <Button variant="ghost" size="icon" onClick={()=> setCommandOpen(true)} title="Command palette (Ctrl+K)"><Command size={16}/></Button>

        {page && (
          <>
            <Button variant="ghost" size="icon" onClick={()=> useAppStore.getState().toggleFavorite(page.id)}><Star size={16} className={page.isFavorite ? "fill-amber-400 text-amber-400" : ""}/></Button>
            <Button variant="ghost" size="icon"><Share2 size={16}/></Button>
            <Button variant="ghost" size="icon"><History size={16}/></Button>
            <Button variant="ghost" size="icon"><MoreHorizontal size={16}/></Button>
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex"><Sparkles size={14} className="mr-1"/> Ask AI</Button>
          </>
        )}

        <div className="relative">
          <Button variant="ghost" size="icon"><Bell size={16}/></Button>
          {notifications.filter(n=>!n.read).length>0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] grid place-items-center rounded-full">{notifications.filter(n=>!n.read).length}</span>}
        </div>
        <img src={`https://i.pravatar.cc/100?img=32`} alt="avatar" className="w-8 h-8 rounded-xl border object-cover" />
      </div>
    </div>
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

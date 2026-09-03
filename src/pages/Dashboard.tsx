import { useAppStore } from '@/stores/appStore'
import { Card, CardContent, CardHeader } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, FileText, Database, Clock, Star, TrendingUp, Activity, Users, Sparkles } from 'lucide-react'
import { formatRelative } from '@/lib/utils'
import { PageIcon, PageIconInline } from '@/components/ui/pageIcon'

export function Dashboard({ onNavigate }: { onNavigate?: (r:string)=>void }) {
  const { pages, databases, records, activities, createPage, setSelectedPage, setSelectedDatabase, user } = useAppStore()
  const recent = [...pages].filter(p=>!p.isTrashed).sort((a,b)=> new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime()).slice(0,6)
  const favs = pages.filter(p=> p.isFavorite).slice(0,4)
  const hour = new Date().getHours()
  const greeting = hour <12 ? 'Good morning' : hour<18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-6">
      <div className="rounded-[24px] bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-6 md:p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="relative">
          <div className="text-sm opacity-80">{new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric'})}</div>
          <h1 className="text-3xl font-bold mt-1">{greeting}, {user.name.split(' ')[0]}.</h1>
          <p className="opacity-80 mt-2 max-w-[600px]">Your workspace is a calm, intelligent surface for thinking. {pages.length} pages • {databases.length} databases • {records.length} records.</p>
          <div className="flex flex-wrap gap-2 mt-5">
            <Button onClick={()=> createPage('Untitled')} className="bg-white text-violet-700 hover:bg-white/90 rounded-xl"><Plus size={16} className="mr-1"/> New Page</Button>
            <Button onClick={()=> useAppStore.getState().createDatabase('New Database')} variant="secondary" className="bg-white/15 text-white hover:bg-white/20 border-white/20 rounded-xl border"> <Database size={16} className="mr-1"/> New Database</Button>
            <Button variant="ghost" className="bg-white/10 text-white hover:bg-white/15 rounded-xl border border-white/15">Import</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pages', value: pages.length, icon: FileText, change: '+3 this week' },
          { label: 'Tasks', value: records.length, icon: Activity, change: '5 due soon' },
          { label: 'Databases', value: databases.length, icon: Database, change: 'All synced' },
          { label: 'Favorites', value: favs.length, icon: Star, change: 'Quick access' },
        ].map(s=> (
          <Card key={s.label} className="rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{s.label}</span>
                <s.icon size={16} className="text-muted-foreground"/>
              </div>
              <div className="text-2xl font-bold mt-2">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><TrendingUp size={12}/>{s.change}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold flex items-center gap-2"><Clock size={16}/> Recently opened</h3>
            <Button variant="ghost" size="sm">View all</Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.map(p=> (
              <button key={p.id} onClick={()=> setSelectedPage(p.id)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent text-left">
                <PageIcon page={p} size="md" />
                <span className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{formatRelative(p.updatedAt)} • Edited</div>
                </span>
                <span className="text-xs border rounded-full px-2 py-1 hidden sm:inline">{p.isFavorite ? '★ Favorite' : 'Page'}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader><h3 className="font-semibold flex items-center gap-2"><Star size={16} className="text-amber-500"/> Favorites</h3></CardHeader>
            <CardContent className="space-y-2">
              {favs.length===0 ? <div className="text-sm text-muted-foreground py-6 text-center border rounded-xl border-dashed">Star pages for quick access</div> :
                favs.map(p=> <button key={p.id} onClick={()=> setSelectedPage(p.id)} className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-accent text-sm font-medium"><PageIconInline page={p} /> {p.title}</button>)}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader><h3 className="font-semibold flex items-center gap-2"><Database size={16}/> Databases</h3></CardHeader>
            <CardContent className="space-y-2">
              {databases.map(db=> (
                <button key={db.id} onClick={()=> setSelectedDatabase(db.id)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent border text-left">
                  <span className="w-8 h-8 rounded-lg bg-violet-500/10 grid place-items-center">▦</span>
                  <span className="flex-1">
                    <div className="text-sm font-medium">{db.name}</div>
                    <div className="text-xs text-muted-foreground">{records.filter(r=>r.databaseId===db.id).length} records</div>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><h3 className="font-semibold">Quick actions</h3></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: 'New Page', icon: FileText, action: ()=> createPage('Untitled')},
              { label: 'New Task', icon: Plus, action: ()=> setSelectedDatabase(databases[0]?.id)},
              { label: 'Search', icon: Clock, action: ()=> useAppStore.getState().setSearchOpen(true)},
              { label: 'Ask AI', icon: Sparkles, action: ()=> {}},
            ].map(a=> (
              <button key={a.label} onClick={a.action} className="flex items-center gap-2 p-3 rounded-xl border hover:bg-accent text-sm font-medium">
                <a.icon size={16}/> {a.label}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader><h3 className="font-semibold flex items-center gap-2"><Activity size={16}/> Activity</h3></CardHeader>
          <CardContent className="space-y-3">
            {activities.slice(0,6).map(act=> (
              <div key={act.id} className="flex items-center gap-3 text-sm">
                <img src={`https://i.pravatar.cc/100?img=12`} className="w-7 h-7 rounded-full" alt=""/>
                <span className="flex-1"><span className="font-medium">{user.name}</span> <span className="text-muted-foreground">{act.action.replace('_',' ')}</span> <span className="font-medium">{act.targetType}</span></span>
                <span className="text-xs text-muted-foreground">{formatRelative(act.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

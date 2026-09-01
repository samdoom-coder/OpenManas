import { useAppStore } from '@/stores/appStore'
import { DatabaseViews } from '@/components/database/DatabaseViews'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Share2, Star } from 'lucide-react'

export function DatabasePage({ databaseId }: { databaseId: string }) {
  const { databases } = useAppStore()
  const db = databases.find(d=> d.id===databaseId)
  if (!db) return <div className="p-8 text-center text-muted-foreground">Database not found</div>
  return (
    <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center text-white text-xl">▦</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{db.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{db.description || 'A structured collection for your workspace.'}</p>
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="px-2 py-1 rounded-full border bg-card">{db.properties.length} properties</span>
            <span className="px-2 py-1 rounded-full border bg-card">{db.views.length} views</span>
            <span className="px-2 py-1 rounded-full bg-muted">Updated {new Date(db.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <Button variant="ghost" size="icon"><Star size={16}/></Button>
          <Button variant="ghost" size="icon"><Share2 size={16}/></Button>
          <Button variant="ghost" size="icon"><MoreHorizontal size={16}/></Button>
        </div>
      </div>

      <DatabaseViews database={db} />

      <div className="rounded-2xl border p-4 bg-muted/20">
        <div className="text-sm font-medium">About this database</div>
        <div className="text-xs text-muted-foreground mt-1">Properties are dynamic. Add relation rollups to connect Tasks → Projects → Team. Views are persisted per user.</div>
      </div>
    </div>
  )
}

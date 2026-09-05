import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { DatabaseViews } from '@/components/database/DatabaseViews'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoreHorizontal, Share2, Star, Trash2 } from 'lucide-react'
import { EmojiPicker } from '@/components/ui/emojiPicker'

export function DatabasePage({ databaseId }: { databaseId: string }) {
  const { databases, updateDatabase, toggleDatabaseFavorite, deleteDatabase } = useAppStore()
  const db = databases.find(d=> d.id===databaseId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [desc, setDesc] = useState<string | null>(null)
  if (!db) return <div className="p-8 text-center text-muted-foreground">Database not found</div>

  const commitName = () => {
    if (name !== null && name.trim() && name.trim() !== db.name) updateDatabase(db.id, { name })
    setName(null)
  }
  const commitDesc = () => {
    if (desc !== null && desc !== (db.description ?? '')) updateDatabase(db.id, { description: desc })
    setDesc(null)
  }

  return (
    <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-6">
      <div className="flex items-start gap-4">
        <div className="relative">
          <button
            onClick={()=> setIconOpen(v=> !v)}
            title="Change icon"
            className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center text-white text-xl hover:opacity-90"
          >
            {db.icon || '▦'}
          </button>
          {iconOpen && (
            <div className="absolute left-0 top-full mt-2 z-30">
              <EmojiPicker onSelect={(e: string)=> { updateDatabase(db.id, { icon: e }); setIconOpen(false) }} onClose={()=> setIconOpen(false)} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {name !== null ? (
            <Input
              autoFocus
              value={name}
              onChange={e=> setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={e=> { if (e.key==='Enter') commitName(); if (e.key==='Escape') setName(null) }}
              className="text-2xl font-bold h-auto py-1"
              maxLength={100}
            />
          ) : (
            <h1 onClick={()=> setName(db.name)} title="Click to rename" className="text-3xl font-bold tracking-tight truncate cursor-text hover:bg-accent/40 rounded-lg px-1 -ml-1">{db.name}</h1>
          )}
          {desc !== null ? (
            <Input
              autoFocus
              value={desc}
              onChange={e=> setDesc(e.target.value)}
              onBlur={commitDesc}
              onKeyDown={e=> { if (e.key==='Enter') commitDesc(); if (e.key==='Escape') setDesc(null) }}
              placeholder="Add a description…"
              className="text-sm mt-1"
              maxLength={2000}
            />
          ) : (
            <p onClick={()=> setDesc(db.description ?? '')} title="Click to edit description" className="text-sm text-muted-foreground mt-1 cursor-text hover:bg-accent/40 rounded-lg px-1 -ml-1 truncate">
              {db.description || 'Add a description…'}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="px-2 py-1 rounded-full border bg-card">{db.properties.length} properties</span>
            <span className="px-2 py-1 rounded-full border bg-card">{db.views.length} views</span>
            <span className="px-2 py-1 rounded-full bg-muted">Updated {new Date(db.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 relative">
          <Button variant="ghost" size="icon" title={db.isFavorite ? 'Remove from favorites' : 'Add to favorites'} onClick={()=> toggleDatabaseFavorite(db.id)}>
            <Star size={16} className={db.isFavorite ? 'fill-amber-400 text-amber-400' : ''} />
          </Button>
          <Button variant="ghost" size="icon"><Share2 size={16}/></Button>
          <Button variant="ghost" size="icon" title="More actions" onClick={()=> { setMenuOpen(v=> !v); setConfirmDelete(false) }}><MoreHorizontal size={16}/></Button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl border bg-popover shadow-xl p-1.5">
              {!confirmDelete ? (
                <button
                  onClick={()=> setConfirmDelete(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 size={14}/> Delete database
                </button>
              ) : (
                <div className="p-1.5">
                  <div className="text-xs text-muted-foreground px-1.5 pb-2">Delete “{db.name}” and all its records? This can't be undone.</div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1" onClick={()=> setConfirmDelete(false)}>Keep</Button>
                    <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={()=> deleteDatabase(db.id)}>Delete</Button>
                  </div>
                </div>
              )}
            </div>
          )}
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

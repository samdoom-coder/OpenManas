import { useAppStore } from '@/stores/appStore'
import { BlockEditor } from '@/components/editor/BlockEditor'
import { Button } from '@/components/ui/button'
import { Star, Share2, MoreHorizontal, MessageSquare, History, Copy, Trash2, Archive } from 'lucide-react'
import { useState, useRef } from 'react'
import { EmojiPicker } from '@/components/ui/emojiPicker'

export function PageView({ pageId }: { pageId: string }) {
  const { pages, updatePage, deletePage, duplicatePage, toggleFavorite, blocks, addBlock } = useAppStore()
  const page = pages.find(p=> p.id===pageId)
  const [editingTitle, setEditingTitle] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [iconPicker, setIconPicker] = useState(false)
  const commentsRef = useRef<HTMLDivElement>(null)

  if (!page) return <div className="p-8 text-center text-muted-foreground">Page not found or trashed.</div>
  if (page.isTrashed) return <TrashedView page={page} />

  const backlinks = findBacklinks(pageId, pages, blocks)

  return (
    <div className="max-w-[860px] mx-auto w-full">
      {page.cover && <div className="h-[180px] rounded-b-2xl overflow-hidden bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500" style={page.cover.startsWith('http') ? { backgroundImage: `url(${page.cover})`, backgroundSize:'cover'} : {}} />}
      <div className="px-6 md:px-8 py-6 space-y-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 rounded-full border bg-muted">Private</span>
          <span>•</span>
          <span>Edited {new Date(page.updatedAt).toLocaleString()}</span>
          <span className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={()=> commentsRef.current?.scrollIntoView({ behavior:'smooth'})}><MessageSquare size={14} className="mr-1"/> Comments</Button>
            <Button variant="ghost" size="icon" onClick={()=> toggleFavorite(page.id)}><Star size={16} className={page.isFavorite ? 'fill-amber-400 text-amber-400':''}/></Button>
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="relative">
              <button onClick={()=> setIconPicker(!iconPicker)} className="text-4xl leading-none p-1 hover:bg-accent rounded-xl">{page.icon || '📄'}</button>
              {iconPicker && <div className="absolute top-full mt-2 z-20"><EmojiPicker onSelect={(e)=> { updatePage(page.id, { icon:e }); setIconPicker(false) }} onClose={()=> setIconPicker(false)} /></div>}
            </div>
            <div className="flex-1">
              {editingTitle ? (
                <input autoFocus defaultValue={page.title} onBlur={e=> { updatePage(page.id, { title: e.target.value || 'Untitled'}); setEditingTitle(false)}} onKeyDown={e=> e.key==='Enter' && (e.target as HTMLInputElement).blur()} className="w-full text-4xl font-bold tracking-tight bg-transparent outline-none border-b"/>
              ) : (
                <h1 onClick={()=> setEditingTitle(true)} className="text-4xl font-bold tracking-tight cursor-text hover:bg-accent/30 rounded-xl px-1 -mx-1">{page.title || 'Untitled'}</h1>
              )}
              <input placeholder="Add description..." defaultValue={page.description||''} onBlur={e=> updatePage(page.id, { description: e.target.value })} className="w-full mt-2 text-sm text-muted-foreground bg-transparent outline-none placeholder:text-muted-foreground/60"/>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-2 border-y text-xs">
            <PropertyPill label="Created" value={new Date(page.createdAt).toLocaleDateString()}/>
            <PropertyPill label="Updated" value={new Date(page.updatedAt).toLocaleDateString()}/>
            <PropertyPill label="Owner" value={useAppStore.getState().user.name}/>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={()=> duplicatePage(page.id)}><Copy size={14} className="mr-1"/> Duplicate</Button>
              <Button variant="ghost" size="sm" onClick={()=> updatePage(page.id, { isArchived:true })}><Archive size={14} className="mr-1"/> Archive</Button>
              <Button variant="ghost" size="sm" onClick={()=> deletePage(page.id)} className="text-red-600"><Trash2 size={14} className="mr-1"/> Trash</Button>
            </div>
          </div>
        </div>

        <BlockEditor pageId={pageId} />

        <div className="pt-6 border-t space-y-6">
          {backlinks.length>0 && (
            <div className="rounded-2xl border p-4 bg-muted/20">
              <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Linked from — {backlinks.length}</div>
              <div className="space-y-1">{backlinks.map(b=> <div key={b.id} className="text-sm p-2 rounded-xl hover:bg-accent">{b.title}</div>)}</div>
            </div>
          )}

          <div ref={commentsRef} className="rounded-2xl border p-4">
            <div className="font-medium text-sm mb-3">Comments</div>
            <CommentSection pageId={pageId} />
          </div>

          <PageVersionHistory pageId={pageId} />
        </div>
      </div>
    </div>
  )
}

function PropertyPill({ label, value }: { label:string, value:string }) {
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-card text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></span>
}

function findBacklinks(pageId:string, pages:any[], blocks:any[]) {
  // naive: blocks that mention pageId or pages that have relation
  const linkingBlocks = blocks.filter(b=> b.content.includes(pageId) || String(b.properties?.pageId)===pageId)
  const pageIds = [...new Set(linkingBlocks.map(b=> b.pageId))]
  return pages.filter(p=> pageIds.includes(p.id) && p.id!==pageId)
}

function TrashedView({ page }: { page:any }) {
  const { restorePage } = useAppStore() as any
  // add restore fn in store if missing
  return (
    <div className="max-w-[600px] mx-auto p-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-muted grid place-items-center mx-auto mb-4"><Trash2 size={20}/></div>
      <h2 className="text-xl font-semibold">{page.title} is in Trash</h2>
      <p className="text-sm text-muted-foreground mt-2">Restore to continue editing or delete permanently.</p>
      <div className="flex justify-center gap-2 mt-6">
        <Button onClick={()=> restorePage(page.id)}>Restore</Button>
        <Button variant="outline">Delete forever</Button>
      </div>
    </div>
  )
}

function CommentSection({ pageId }: { pageId:string }) {
  const { comments, addComment, user } = useAppStore()
  const pageComments = comments.filter(c=> c.pageId===pageId)
  const [text, setText] = useState('')
  return (
    <div className="space-y-3">
      {pageComments.length===0 && <div className="text-sm text-muted-foreground py-4 text-center border rounded-xl border-dashed">No comments yet. Start a discussion.</div>}
      {pageComments.map(c=> (
        <div key={c.id} className="flex gap-3 p-3 rounded-xl bg-muted/30 border">
          <img src={`https://i.pravatar.cc/100?img=15`} className="w-7 h-7 rounded-full shrink-0" alt=""/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <div className="text-sm mt-1">{c.content}</div>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={text} onChange={e=> setText(e.target.value)} placeholder="Add a comment... @mention" className="flex-1 h-9 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"/>
        <Button disabled={!text.trim()} onClick={()=> { addComment({ pageId, blockId: undefined, recordId: undefined, authorId: user.id, content: text, parentId: null } as any); setText('')}}>Send</Button>
      </div>
    </div>
  )
}

function PageVersionHistory({ pageId }: { pageId:string }) {
  return (
    <div className="rounded-2xl border p-4 bg-card">
      <div className="flex items-center gap-2 font-medium text-sm"><History size={16}/> Version history</div>
      <div className="text-xs text-muted-foreground mt-1">Autosaved versions. Restore any point in time.</div>
      <div className="mt-3 space-y-2">
        {[
          { v: 12, at: new Date().toLocaleString(), by: 'You' },
          { v: 11, at: new Date(Date.now()-3600000).toLocaleString(), by: 'You' },
          { v: 10, at: new Date(Date.now()-7200000).toLocaleString(), by: 'Alex' },
        ].map(item=> (
          <div key={item.v} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent text-sm">
            <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center font-mono text-xs">v{item.v}</span>
            <span className="flex-1">{item.at} • {item.by}</span>
            <Button variant="ghost" size="sm">Restore</Button>
          </div>
        ))}
      </div>
    </div>
  )
}


import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { BlockRegistry, detectMarkdownShortcut, stripMarkdownPrefix } from '@/lib/blockRegistry'
import type { Block } from '@/lib/types'
import { GripVertical, Plus, Trash2, Copy, Palette, MessageSquare, ArrowUp, ArrowDown, Image as ImageIcon, Code, Quote, Table as TableIcon, Bookmark, ChevronDown, Timer, Repeat2, BarChart3, Calendar, CheckSquare, Hash, Type, MoreHorizontal, Settings, SlidersHorizontal, Undo2, Redo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { storageService } from '@/lib/storageService'
import { useToast } from '@/components/ui/toast'
import { DatabaseViews } from '@/components/database/DatabaseViews'
import { EmojiPicker } from '@/components/ui/emojiPicker'
import { PageIconInline } from '@/components/ui/pageIcon'
import { FontPicker } from '@/components/ui/fontPicker'
import { useBlockHistory } from '@/hooks/useBlockHistory'

export function BlockEditor({ pageId }: { pageId: string }) {
  const { blocks, addBlock, updateBlock, deleteBlock, moveBlock, duplicateBlock } = useAppStore()
  const pageBlocks = blocks.filter(b=>b.pageId===pageId).sort((a,b)=> a.position-b.position)
  const { canUndo, canRedo, undo, redo } = useBlockHistory(pageId, pageBlocks)
  const [slashFor, setSlashFor] = useState<string | null>(null)
  const [slashQuery, setSlashQuery] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const handleNew = (pos?: number, type:string='paragraph') => {
    const b = addBlock(pageId, type as any, '', pos)
    setTimeout(()=> document.getElementById(`block-${b.id}`)?.focus(), 30)
  }

  const historyBar = (
    <div className="flex items-center gap-1 pb-2">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="p-1.5 rounded-lg border bg-card text-xs flex items-center gap-1 disabled:opacity-40 hover:bg-accent"
      >
        <Undo2 size={13} /> Undo
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className="p-1.5 rounded-lg border bg-card text-xs flex items-center gap-1 disabled:opacity-40 hover:bg-accent"
      >
        <Redo2 size={13} /> Redo
      </button>
      <span className="text-[11px] text-muted-foreground ml-1 hidden sm:inline">Ctrl+Z / Ctrl+Shift+Z</span>
    </div>
  )

  if (pageBlocks.length===0) {
    return (
      <div className="py-8">
        {historyBar}
        <EmptyBlockState onClick={()=> handleNew(0)} />
        <button onClick={()=> handleNew(0)} className="mt-4 w-full py-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-accent">+ Add first block</button>
      </div>
    )
  }

  return (
    <div className="space-y-1 py-2">
      {historyBar}
      {pageBlocks.map((block, idx)=> (
        <BlockRow
          key={block.id}
          block={block}
          index={idx}
          onChange={(patch)=> updateBlock(block.id, patch)}
          onDelete={()=> deleteBlock(block.id)}
          onDuplicate={()=> duplicateBlock(block.id)}
          onMove={(dir)=> moveBlock(block.id, dir==='up' ? Math.max(0, idx-1) : Math.min(pageBlocks.length-1, idx+1))}
          onSlash={(q)=> { setSlashFor(block.id); setSlashQuery(q) }}
          slashOpen={slashFor===block.id}
          slashQuery={slashQuery}
          closeSlash={()=> setSlashFor(null)}
          dragId={dragId}
          setDragId={setDragId}
          onDrop={(dragId, targetId)=> {
            const dragIdx = pageBlocks.findIndex(b=>b.id===dragId)
            const targetIdx = pageBlocks.findIndex(b=>b.id===targetId)
            if (dragIdx>-1 && targetIdx>-1) moveBlock(dragId, targetIdx)
          }}
          onEnter={(nextType)=> handleNew(idx+1, nextType as any || 'paragraph')}
          onAddBelow={()=> handleNew(idx+1, 'paragraph')}
          onMarkdown={(newType, newContent)=> updateBlock(block.id, { type: newType as any, content: newContent })}
        />
      ))}
      <button onClick={()=> handleNew()} className="mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent border border-dashed w-full justify-center">
        + Add block — type “/” for commands
      </button>
    </div>
  )
}

function EmptyBlockState({ onClick }: { onClick: ()=>void }) {
  return (
    <div onClick={onClick} className="rounded-2xl border border-dashed p-8 text-center hover:bg-accent/40 cursor-pointer">
      <div className="w-10 h-10 rounded-xl bg-violet-500/10 grid place-items-center mx-auto mb-3">✎</div>
      <div className="font-medium">Start writing</div>
      <div className="text-sm text-muted-foreground mt-1">Type “/” for blocks, or just start typing. Markdown shortcuts work.</div>
    </div>
  )
}

function BlockRow({ block, onChange, onDelete, onDuplicate, onMove, onSlash, slashOpen, slashQuery, closeSlash, dragId, setDragId, onDrop, onEnter, onAddBelow, onMarkdown }: {
  block: Block, index:number, onChange:(p:Partial<Block>)=>void, onDelete:()=>void, onDuplicate:()=>void, onMove:(d:'up'|'down')=>void,
  onSlash:(q:string)=>void, slashOpen:boolean, slashQuery:string, closeSlash:()=>void,
  dragId:string|null, setDragId:(id:string|null)=>void, onDrop:(a:string,b:string)=>void, onEnter:(nextType?:string)=>void, onAddBelow:()=>void, onMarkdown:(t:string,c:string)=>void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { push } = useToast()
  const { addComment, user, pages, databases, comments } = useAppStore() as any
  const commentCount = (comments as any[]).filter((c:any)=> c.blockId===block.id).length

  const insertEmoji = (emoji:string) => {
    if (contentRef.current) {
      contentRef.current.focus()
      document.execCommand('insertText', false, emoji)
      handleInput()
    } else {
      onChange({ content: (block.content || '') + emoji })
    }
    setEmojiOpen(false)
  }
  const handleFontChange = (patch:any) => {
    onChange({ properties:{ ...block.properties, ...patch }})
  }
  const clearSlashContent = () => {
    const el = contentRef.current
    if (el && el.innerText.startsWith('/')) {
      el.innerHTML = ''
      onChange({ content: '' })
    }
  }
  const handleSlashSelect = (newType: string) => {
    onChange({ type: newType as any, content: '' })
    closeSlash()
    setTimeout(()=> {
      if (contentRef.current) {
        contentRef.current.innerHTML = ''
        contentRef.current.focus()
        const range = document.createRange()
        range.selectNodeContents(contentRef.current)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }, 10)
  }
  const handleCloseSlash = () => {
    const el = contentRef.current
    if (el && el.innerText.startsWith('/')) {
      el.innerHTML = block.content || ''
    }
    closeSlash()
  }

  useEffect(()=> {
    const el = contentRef.current
    if (!el) return
    const isFocused = document.activeElement === el
    if (isFocused) return
    const current = el.innerHTML
    const target = block.content || ''
    if (current !== target) {
      el.innerHTML = target
    }
  }, [block.content, block.type])

  useEffect(()=> {
    const el = contentRef.current
    if (el && (el.innerHTML !== (block.content||''))) {
      if (document.activeElement !== el) {
        el.innerHTML = block.content || ''
      }
    }
  }, [block.id, block.type])

  // Undo/redo restores the store while this block may still be focused.
  // The effects above intentionally skip syncing when focused (to avoid
  // reverse-typing), so without this the editor would keep showing stale
  // DOM and undo would *look* broken. historyRev only changes on
  // restorePageBlocks, never during normal typing, so this can't fight
  // the user mid-keystroke.
  const historyRev = useAppStore(s => s.historyRev)
  useEffect(()=> {
    if (!historyRev) return
    const el = contentRef.current
    if (!el) return
    const target = block.content || ''
    if (el.innerHTML !== target) {
      el.innerHTML = target
      if (document.activeElement === el) {
        el.focus()
        try {
          const range = document.createRange()
          range.selectNodeContents(el)
          range.collapse(false)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
        } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyRev])

  // close drag menu on outside click
  useEffect(()=> {
    if (!actionsMenuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (menuRef.current && !menuRef.current.contains(target) && !target.closest('[data-drag-handle]')) {
        setActionsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return ()=> document.removeEventListener('mousedown', handler)
  }, [actionsMenuOpen])

  const checkSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setHasSelection(false)
      return
    }
    const anchor = sel.anchorNode
    const focusNode = sel.focusNode
    const el = contentRef.current
    if (el && ((anchor && el.contains(anchor)) || (focusNode && el.contains(focusNode)))) {
      setHasSelection(true)
    } else {
      setHasSelection(false)
    }
  }
  const handleMouseUp = () => setTimeout(checkSelection, 10)
  const handleKeyUp = () => setTimeout(checkSelection, 10)
  const handleClickContent = () => setTimeout(checkSelection, 10)

  useEffect(()=> {
    if (!focused) {
      const id = setTimeout(()=> setHasSelection(false), 250)
      return ()=> clearTimeout(id)
    }
  }, [focused])

  const handleInput = () => {
    const el = contentRef.current
    if (!el) return
    const text = el.innerText || ''
    const html = el.innerHTML
    if (text.startsWith('/')) {
      onSlash(text.slice(1))
      return
    }
    if (slashOpen) closeSlash()
    if (block.type==='paragraph' && text.length>1) {
      const md = detectMarkdownShortcut(text)
      if (md) {
        const stripped = stripMarkdownPrefix(text, md)
        onMarkdown(md, stripped)
        setTimeout(()=> {
          if (contentRef.current) {
            contentRef.current.innerHTML = stripped
            const range = document.createRange()
            range.selectNodeContents(contentRef.current)
            range.collapse(false)
            const sel = window.getSelection()
            sel?.removeAllRanges()
            sel?.addRange(range)
          }
        },0)
        return
      }
    }
    onChange({ content: html })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key==='Enter' && !e.shiftKey) {
      if (slashOpen) {
        return
      }
      e.preventDefault()
      const listTypes = ['todo','bulleted_list','numbered_list']
      const next = listTypes.includes(block.type) ? block.type : 'paragraph'
      const isEmpty = !(contentRef.current?.innerText || '').trim()
      if (isEmpty && listTypes.includes(block.type)) {
        onChange({ type: 'paragraph' as any })
        onEnter('paragraph')
      } else {
        onEnter(next)
      }
    }
    if (e.key==='Backspace') {
      const text = (contentRef.current?.innerText || '').trim()
      if (!text) {
        e.preventDefault()
        onDelete()
      }
    }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='b') {
      e.preventDefault(); document.execCommand('bold')
      handleInput()
    }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='i') {
      e.preventDefault(); document.execCommand('italic')
      handleInput()
    }
    if (e.key==='Escape' && slashOpen) {
      closeSlash()
    }
    if (e.key==='Escape' && actionsMenuOpen) {
      setActionsMenuOpen(false)
    }
  }

  const colors = [
    { name:'Default', color:'', bg:'' },
    { name:'Black', color:'#111827', bg:'#f9fafb' },
    { name:'Gray', color:'#6b7280', bg:'#f3f4f6' },
    { name:'Brown', color:'#78350f', bg:'#fef3c7' },
    { name:'Orange', color:'#9a3412', bg:'#ffedd5' },
    { name:'Yellow', color:'#854d0e', bg:'#fef9c3' },
    { name:'Amber', color:'#92400e', bg:'#fef3c7' },
    { name:'Lime', color:'#365314', bg:'#ecfccb' },
    { name:'Green', color:'#14532d', bg:'#dcfce7' },
    { name:'Emerald', color:'#065f46', bg:'#d1fae5' },
    { name:'Teal', color:'#134e4a', bg:'#ccfbf1' },
    { name:'Cyan', color:'#164e63', bg:'#cffafe' },
    { name:'Sky', color:'#0c4a6e', bg:'#e0f2fe' },
    { name:'Blue', color:'#1e40af', bg:'#dbeafe' },
    { name:'Indigo', color:'#3730a3', bg:'#e0e7ff' },
    { name:'Violet', color:'#5b21b6', bg:'#ede9fe' },
    { name:'Purple', color:'#6b21a8', bg:'#f3e8ff' },
    { name:'Fuchsia', color:'#86198f', bg:'#fae8ff' },
    { name:'Pink', color:'#9d174d', bg:'#fce7f3' },
    { name:'Rose', color:'#9f1239', bg:'#ffe4e6' },
    { name:'Red', color:'#991b1b', bg:'#fee2e2' },
  ]

  // helper to render drag-handle menu (full width pattern)
  // Left gutter: [+] adds a new empty block below this one, [grip] drag/reorder + options
  const renderDragMenu = () => (
    <>
      <div className="absolute left-0 top-1 z-10 flex -translate-x-full flex-col gap-1 pr-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 max-sm:opacity-100 transition-opacity">
        <button
          onClick={(e)=> { e.stopPropagation(); onAddBelow() }}
          className="p-0.5 sm:p-1 rounded-lg border shadow-sm bg-card hover:bg-accent hover:text-violet-600 cursor-pointer flex items-center justify-center"
          title="Add block below"
          aria-label="Add block below"
        >
          <Plus size={14} />
        </button>
        <button
          data-drag-handle
          onClick={(e)=> { e.stopPropagation(); setActionsMenuOpen(v=>!v) }}
          className={cn("p-0.5 sm:p-1 rounded-lg border shadow-sm bg-card hover:bg-accent cursor-grab flex items-center justify-center", actionsMenuOpen && "opacity-100 bg-accent border-violet-200")}
          title="Click for options • Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
      </div>
      {actionsMenuOpen && (
        <div ref={menuRef} className="absolute left-0 top-12 z-20 bg-popover border rounded-2xl shadow-xl p-3 w-[340px] max-w-[92vw] animate-in fade-in">
          <div className="px-1 pb-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Settings size={12}/> Block options</span>
            <button onClick={()=> setActionsMenuOpen(false)} className="p-1 hover:bg-accent rounded-lg text-xs">✕</button>
          </div>
          <BlockActions
            block={block}
            onChange={onChange}
            onDuplicate={()=> { setActionsMenuOpen(false); onDuplicate() }}
            onDelete={()=> { setActionsMenuOpen(false); onDelete() }}
            onMove={onMove}
            onColor={()=> { setActionsMenuOpen(false); setColorOpen(true) }}
            onComment={()=> { setActionsMenuOpen(false); setCommentOpen(true) }}
            currentType={block.type}
            onTurnInto={(t)=> { setActionsMenuOpen(false); handleSlashSelect(t) }}
            commentCount={commentCount}
            forceShow
          />
          <div className="flex items-center gap-1 mt-3 pt-3 border-t">
            <button onClick={()=> onMove('up')} className="flex-1 py-2 rounded-xl border hover:bg-accent text-xs flex items-center justify-center gap-1.5"><ArrowUp size={12}/> Move up</button>
            <button onClick={()=> onMove('down')} className="flex-1 py-2 rounded-xl border hover:bg-accent text-xs flex items-center justify-center gap-1.5"><ArrowDown size={12}/> Move down</button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2.5 text-center leading-relaxed">Select text to see formatting toolbar • Drag handle to reorder • Click handle for more</div>
        </div>
      )}
    </>
  )

  const renderCommentHover = () => (
    <button
      onClick={(e)=>{ e.stopPropagation(); setCommentOpen(true) }}
      className="absolute right-1 top-1.5 z-10 p-1 rounded-md bg-card border shadow-sm hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
      title={commentCount ? `${commentCount} comment${commentCount>1?'s':''} — click to open` : "Add comment"}
    >
      <MessageSquare size={12} className={commentCount ? "text-violet-600" : "text-muted-foreground"} />
      {commentCount ? <span className="absolute -top-1 -right-1 min-w-[14px] h-[12px] px-0.5 bg-violet-500 text-white text-[8px] font-bold rounded-full grid place-items-center leading-none">{commentCount>9?'9+':commentCount}</span> : null}
    </button>
  )

  const renderSelectionBubble = () => {
    if (!hasSelection || !focused) return null
    return (
      <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-popover border rounded-xl shadow-xl p-1.5 max-w-[95vw] overflow-x-auto">
        <button onMouseDown={e=>{e.preventDefault(); document.execCommand('bold'); handleInput()}} className="px-2.5 py-1.5 rounded-lg hover:bg-accent font-bold text-sm shrink-0">B</button>
        <button onMouseDown={e=>{e.preventDefault(); document.execCommand('italic'); handleInput()}} className="px-2.5 py-1.5 rounded-lg hover:bg-accent italic text-sm shrink-0">I</button>
        <button onMouseDown={e=>{e.preventDefault(); document.execCommand('underline'); handleInput()}} className="px-2.5 py-1.5 rounded-lg hover:bg-accent underline text-sm shrink-0">U</button>
        <button onMouseDown={e=>{e.preventDefault(); document.execCommand('strikeThrough'); handleInput()}} className="px-2.5 py-1.5 rounded-lg hover:bg-accent line-through text-sm shrink-0">S</button>
        <div className="w-px h-6 bg-border mx-1 shrink-0" />
        <button onMouseDown={e=>{e.preventDefault(); setColorOpen(true)}} className="p-1.5 rounded-lg hover:bg-accent shrink-0" title="Color"><Palette size={14}/></button>
        <button onMouseDown={e=>{e.preventDefault(); setCommentOpen(true)}} className="p-1.5 rounded-lg hover:bg-accent relative shrink-0" title="Comment"><MessageSquare size={14}/>{commentCount ? <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-violet-500 text-white text-[9px] rounded-full grid place-items-center px-0.5">{commentCount}</span> : null}</button>
        <button onMouseDown={e=>{e.preventDefault(); onDuplicate()}} className="p-1.5 rounded-lg hover:bg-accent shrink-0" title="Duplicate"><Copy size={14}/></button>
        <div className="w-px h-6 bg-border mx-1 shrink-0" />
        <button onMouseDown={e=>{e.preventDefault(); setActionsMenuOpen(true)}} className="px-3 py-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600 text-xs font-medium whitespace-nowrap shrink-0">More</button>
      </div>
    )
  }

  // Special render for divider - full width, no side flex
  if (block.type==='divider') {
    return (
      <div className={cn("group relative rounded-xl px-1 py-2 hover:bg-accent/30", focused && "bg-accent/20", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full py-2"><hr className="border-t" /></div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  // Special render for todo - full width
  if (block.type==='todo') {
    return (
      <div className={cn("group relative rounded-xl px-1 py-1 hover:bg-accent/30", focused && "bg-accent/20", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full min-w-0 relative flex items-center gap-2 py-1">
          <input type="checkbox" checked={!!block.properties.checked} onChange={e=> onChange({ properties:{ ...block.properties, checked:e.target.checked }})} className="rounded w-4 h-4 shrink-0" />
          <div
            id={`block-${block.id}`}
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={()=> {setFocused(true); setShowToolbar(true)}}
            onBlur={()=> {setFocused(false); setTimeout(()=> setShowToolbar(false), 200)}}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onMouseUp={handleMouseUp}
            onKeyUp={handleKeyUp}
            onClick={handleClickContent}
            data-placeholder="To-do"
            style={{ color: (block.properties.color as string)||undefined, background: (block.properties.background as string)||undefined, fontSize: (block.properties.fontSize as number) ? `${block.properties.fontSize}px` : undefined, fontFamily: (block.properties.fontFamily as string)==='caveat' ? "'Caveat', cursive" : (block.properties.fontFamily as string)==='mono' ? 'JetBrains Mono, monospace' : (block.properties.fontFamily as string)==='serif' ? 'Georgia, serif' : undefined, fontWeight: (block.properties.fontWeight as string)||undefined, fontStyle: (block.properties.italic as boolean) ? 'italic' : undefined }}
            className={cn("flex-1 outline-none min-h-[24px] text-[15px] leading-6 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground", (block.properties.checked as boolean) && "line-through text-muted-foreground")}
          />
          {hasSelection && focused && renderSelectionBubble()}
          {!hasSelection && focused && showToolbar && <FloatingToolbar onFormat={(cmd)=> {document.execCommand(cmd); handleInput()}} />}
          {slashOpen && <SlashMenu query={slashQuery} onSelect={handleSlashSelect} onClose={handleCloseSlash} />}
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  // Special render for image - full width
  if (block.type==='image') {
    return (
      <div className={cn("group relative rounded-xl px-1 py-2 hover:bg-accent/30", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full min-w-0 space-y-2">
          {block.content ? (
            <div className="rounded-xl overflow-hidden border bg-muted">
              <img src={block.content} alt="" className="max-h-[400px] w-full object-contain bg-white" onError={e=> (e.currentTarget.style.display='none')} />
              <div className="p-2 flex items-center gap-2 bg-card border-t">
                <input defaultValue={block.content} onBlur={e=> onChange({ content:e.target.value })} placeholder="Image URL" className="flex-1 text-xs bg-transparent outline-none border rounded-lg px-2 py-1" />
                <Button size="sm" variant="ghost" onClick={()=> onChange({ content:'' })}>Remove</Button>
              </div>
            </div>
          ) : (
            <ImageUpload onUpload={(url)=> onChange({ content:url })} onUrl={(url)=> onChange({ content:url })} />
          )}
          <div className="text-xs text-muted-foreground px-1">Caption: <span ref={contentRef} contentEditable suppressContentEditableWarning onInput={handleInput} onMouseUp={handleMouseUp} data-placeholder="Add caption..." className="outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground" /></div>
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  // Special render for file
  if (block.type==='file' || block.type==='audio') {
    return (
      <div className={cn("group relative rounded-xl px-1 py-2 hover:bg-accent/30", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full min-w-0">
          {block.content ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 grid place-items-center">📎</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{block.content.split('/').pop()?.slice(0,40) || 'File'}</div>
                <div className="text-xs text-muted-foreground">{block.type} • {block.content.slice(0,60)}</div>
              </div>
              <Button size="sm" variant="outline" onClick={()=> window.open(block.content, '_blank')}>Open</Button>
              <Button size="sm" variant="ghost" onClick={()=> onChange({ content:'' })}>Remove</Button>
            </div>
          ) : null}
          <FileUploadSimple onUpload={(url)=> onChange({ content:url })} accept={block.type==='audio' ? 'audio/*' : '*/*'} />
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  // Special render for video
  if (block.type==='video') {
    return (
      <div className={cn("group relative rounded-xl px-1 py-2 hover:bg-accent/30", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full min-w-0 space-y-2">
          {block.content ? (
            <div className="rounded-xl overflow-hidden border bg-black aspect-video grid place-items-center">
              {block.content.includes('youtube') || block.content.includes('youtu.be') ? (
                <iframe src={block.content.replace('watch?v=','embed/')} className="w-full h-full" allowFullScreen />
              ) : (
                <video src={block.content} controls className="w-full h-full" />
              )}
            </div>
          ) : null}
          <input defaultValue={block.content} onBlur={e=> onChange({ content:e.target.value })} placeholder="Paste video URL (YouTube, mp4) — e.g. https://www.youtube.com/watch?v=..." className="w-full text-sm border rounded-xl px-3 py-2 bg-background" />
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  // Table - FULL BLOCK width, options via drag handle now (kept secondary options button for convenience)
  if (block.type==='table') {
    return (
      <div className={cn("group relative rounded-xl px-1 py-2 hover:bg-accent/30", dragId===block.id && "opacity-50", focused && "bg-accent/20")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full">
          <TableBlock content={block.content} onChange={(html)=> onChange({ content: html })} />
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  const isQuote = block.type==='quote'
  const isCode = block.type==='code'
  const isCallout = block.type==='callout'
  const isToggle = block.type==='toggle'
  const isBookmark = block.type==='bookmark'
  const isEquation = block.type==='equation'

  if (isCode) {
    return (
      <div className={cn("group relative rounded-xl px-1 py-1 hover:bg-accent/30", focused && "bg-accent/20", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full min-w-0 relative">
          <div className="flex items-center gap-2 mb-1">
            <Code size={14} className="text-muted-foreground" />
            <select value={(block.properties.language as string)||'plaintext'} onChange={e=> onChange({ properties:{ ...block.properties, language:e.target.value}})} className="text-xs border rounded-lg px-1.5 py-1 bg-background">
              <option>plaintext</option><option>javascript</option><option>typescript</option><option>python</option><option>sql</option><option>json</option>
            </select>
            <button onClick={()=> { navigator.clipboard.writeText(contentRef.current?.innerText||''); push({ title:'Copied code' })}} className="ml-auto text-xs border rounded-lg px-2 py-1 hover:bg-accent">Copy</button>
          </div>
          <div
            id={`block-${block.id}`}
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={()=> {setFocused(true); setShowToolbar(false)}}
            onBlur={()=> setFocused(false)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onMouseUp={handleMouseUp}
            onKeyUp={handleKeyUp}
            data-placeholder="Write code..."
            style={{ color: (block.properties.color as string)||undefined, background: (block.properties.background as string)||undefined }}
            className="outline-none min-h-[80px] p-3 rounded-xl bg-muted border font-mono text-sm whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
          />
          {slashOpen && <SlashMenu query={slashQuery} onSelect={handleSlashSelect} onClose={handleCloseSlash} />}
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  if (isBookmark) {
    return (
      <div className={cn("group relative rounded-xl px-1 py-1 hover:bg-accent/30", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full min-w-0">
          {block.content ? (
            <a href={block.content} target="_blank" rel="noreferrer" className="flex gap-3 p-3 rounded-xl border bg-card hover:bg-accent">
              <div className="w-10 h-10 rounded-lg bg-muted grid place-items-center shrink-0"><Bookmark size={16}/></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{block.content}</div>
                <div className="text-xs text-muted-foreground truncate">{block.properties.title as string || 'Bookmark'}</div>
              </div>
            </a>
          ) : null}
          <input defaultValue={block.content} onBlur={e=> onChange({ content:e.target.value })} placeholder="Paste URL to bookmark..." className="w-full mt-2 text-sm border rounded-xl px-3 py-2 bg-background" />
          <input defaultValue={block.properties.title as string||''} onBlur={e=> onChange({ properties:{ ...block.properties, title:e.target.value}})} placeholder="Title (optional)" className="w-full mt-1 text-xs border rounded-xl px-3 py-1.5 bg-background" />
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  if (isEquation) {
    return (
      <div className={cn("group relative rounded-xl px-1 py-1 hover:bg-accent/30", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">∑ Equation <span className="ml-auto">LaTeX</span></div>
          <div ref={contentRef} contentEditable suppressContentEditableWarning onInput={handleInput} onKeyDown={handleKeyDown} onMouseUp={handleMouseUp} data-placeholder="E = mc^2" className="min-h-[40px] p-3 rounded-xl border bg-muted font-mono text-center text-lg empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground outline-none" />
          <div className="text-xs text-muted-foreground mt-1 text-center">Rendered: <span className="font-mono">{contentRef.current?.innerText||block.content}</span></div>
        </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  if (block.type==='page_embed' || block.type==='database_embed' || block.type==='relation' || block.type==='mention') {
    return (
      <div className={cn("group relative rounded-xl px-1 py-2 hover:bg-accent/30", dragId===block.id && "opacity-50")}
        draggable onDragStart={()=> setDragId(block.id)} onDragEnd={()=> setDragId(null)} onDragOver={e=> e.preventDefault()} onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
      >
        {renderDragMenu()}
        {renderCommentHover()}
        <div className="w-full">
          <div className="p-3 rounded-xl border bg-violet-500/10 flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-card border grid place-items-center text-sm">{block.type==='page_embed' ? '📄' : block.type==='database_embed' ? '▦' : '@'}</span>
            <div className="flex-1">
              <div className="text-sm font-medium capitalize">{block.type.replace('_',' ')}</div>
              <select value={block.content} onChange={e=> onChange({ content:e.target.value })} className="mt-1 w-full text-xs border rounded-lg px-2 py-1 bg-background text-foreground">
                <option value="">Select {block.type.includes('page') ? 'page' : block.type.includes('database') ? 'database' : 'item'}</option>
                {(block.type==='page_embed' ? pages : block.type==='database_embed' ? databases : []).map((p:any)=> <option key={p.id} value={p.id}>{p.title || p.name}</option>)}
              </select>
            </div>
          </div>
            <div ref={contentRef} contentEditable suppressContentEditableWarning onInput={handleInput} onMouseUp={handleMouseUp} data-placeholder="Optional note..." className="mt-2 text-xs outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground" />
            {block.type==='database_embed' && block.content && (()=> { const db:any = databases.find((d:any)=> d.id===block.content); return db ? <div className="mt-3 border rounded-xl overflow-hidden bg-card shadow-sm"><div className="p-2.5 bg-muted/40 border-b text-xs font-medium flex items-center justify-between"><span className="flex items-center gap-2">▦ {db.name} — inline</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500 text-white">LIVE</span></div><div className="max-h-[480px] overflow-auto"><DatabaseViews database={db} compact /></div></div> : null })()}
            {block.type==='page_embed' && block.content && (()=> { const pg:any = pages.find((p:any)=> p.id===block.content); return pg ? <div className="mt-3 p-3 rounded-xl border bg-card"><div className="text-sm font-medium flex items-center gap-1.5"><PageIconInline page={pg} /> {pg.title}</div><div className="text-xs text-muted-foreground line-clamp-2">{pg.description||'Page preview'}</div><button onClick={()=> useAppStore.getState().setSelectedPage(pg.id)} className="mt-2 text-xs text-violet-600 hover:underline">Open →</button></div> : null })()}
          </div>
        {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
        <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
      </div>
    )
  }

  // Default text-like blocks: paragraph, heading1-3, bulleted, numbered, quote, callout, toggle — FULL WIDTH
  return (
    <div
      className={cn("group relative rounded-xl px-1 py-1 hover:bg-accent/30", focused && "bg-accent/20", dragId===block.id && "opacity-50")}
      draggable
      onDragStart={()=> setDragId(block.id)}
      onDragEnd={()=> setDragId(null)}
      onDragOver={e=> e.preventDefault()}
      onDrop={()=> dragId && dragId!==block.id && onDrop(dragId, block.id)}
    >
      {renderDragMenu()}
        {renderCommentHover()}

      <div className="w-full min-w-0 relative">
        {isCallout && <div className="absolute inset-0 rounded-xl bg-amber-500/10 border border-amber-500/20 pointer-events-none" />}
        {isQuote && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500 rounded-full" />}
        {isToggle && (
          <button onClick={()=> onChange({ properties:{ ...block.properties, open: !(block.properties.open as boolean) }})} className="flex items-center gap-1 text-xs text-muted-foreground mb-1 hover:text-foreground">
            <ChevronDown size={12} className={cn("transition-transform", !(block.properties.open as boolean) && "-rotate-90")} /> Toggle {(block.properties.open as boolean) ? 'open' : 'closed'}
          </button>
        )}
        <div
          id={`block-${block.id}`}
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={()=> {setFocused(true); setShowToolbar(true)}}
          onBlur={()=> {setFocused(false); setTimeout(()=> setShowToolbar(false), 200)}}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onMouseUp={handleMouseUp}
          onKeyUp={handleKeyUp}
          onClick={handleClickContent}
          data-placeholder={placeholderFor(block.type)}
          style={{ color: (block.properties.color as string)||undefined, background: isCallout ? undefined : (block.properties.background as string)||undefined, fontSize: (block.properties.fontSize as number) ? `${block.properties.fontSize}px` : undefined, fontFamily: (block.properties.fontFamily as string)==='mono' ? 'JetBrains Mono, monospace' : (block.properties.fontFamily as string)==='serif' ? 'Georgia, serif' : (block.properties.fontFamily as string)==='caveat' ? "'Caveat', cursive" : undefined, fontWeight: (block.properties.fontWeight as string)||undefined, fontStyle: (block.properties.italic as boolean) ? 'italic' : undefined }}
          className={cn(
            "outline-none min-h-[28px] py-1 text-[15px] leading-7 focus:outline-none relative",
            "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none",
            block.type==='heading1' && "text-3xl font-bold tracking-tight py-2",
            block.type==='heading2' && "text-2xl font-semibold py-1.5",
            block.type==='heading3' && "text-xl font-semibold",
            isQuote && "pl-4 italic text-muted-foreground",
            isCallout && "pl-3 pr-3 py-2",
            block.type==='bulleted_list' && "pl-6 list-disc",
            block.type==='numbered_list' && "pl-6 list-decimal",
          )}
        />
        {block.type==='bulleted_list' && <span className="absolute left-2 top-2 text-muted-foreground pointer-events-none">•</span>}
        {block.type==='numbered_list' && <span className="absolute left-0 top-1.5 text-xs text-muted-foreground pointer-events-none"></span>}

        {isToggle && (block.properties.open as boolean) && (
          <div className="ml-6 mt-2 pl-3 border-l">
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={e=> onChange({ properties:{ ...block.properties, body: (e.target as HTMLDivElement).innerHTML }})}
              data-placeholder="Empty toggle — add content..."
              className="min-h-[24px] text-sm outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: ((block.properties.body as string) || '') as string }}
            />
          </div>
        )}

        {hasSelection && focused && renderSelectionBubble()}
        {!hasSelection && focused && showToolbar && (
          <FloatingToolbar onFormat={(cmd)=> {document.execCommand(cmd); handleInput()}} />
        )}

        {slashOpen && <SlashMenu query={slashQuery} onSelect={handleSlashSelect} onClose={handleCloseSlash} />}
      </div>

      {colorOpen && <div className="absolute right-1 top-9 z-30"><ColorPicker colors={colors} current={block.properties as any} onSelect={(c)=> { onChange({ properties:{ ...block.properties, color:c.color, background:c.bg }}); setColorOpen(false)}} onClose={()=> setColorOpen(false)} /></div>}
      <CommentModal open={commentOpen} onClose={()=> setCommentOpen(false)} blockId={block.id} />
    </div>
  )
}

function BlockActions({ block, onChange, onDuplicate, onDelete, onMove, onColor, onComment, currentType, onTurnInto, commentCount, forceShow }: { block?: any, onChange?:(p:any)=>void, onDuplicate:()=>void, onDelete:()=>void, onMove:(d:'up'|'down')=>void, onColor:()=>void, onComment:()=>void, currentType?:string, onTurnInto?:(t:string)=>void, commentCount?:number, forceShow?:boolean }) {
  const [turnOpen, setTurnOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  return (
    <div className={cn("flex items-center gap-1 pt-1 shrink-0 relative flex-wrap", !forceShow && "opacity-0 group-hover:opacity-100")}>
      <div className="relative">
        <button onClick={()=> setEmojiOpen(!emojiOpen)} className="p-1.5 rounded-lg hover:bg-accent" title="Emoji">😊</button>
        {emojiOpen && <div className="absolute left-0 top-full mt-1 z-30"><EmojiPicker onSelect={(e:string)=> { if (onChange && block) onChange({ content: (block.content||'') + ' ' + e }); setEmojiOpen(false) }} onClose={()=> setEmojiOpen(false)} /></div>}
      </div>
      <div className="relative">
        <button onClick={()=> setFontOpen(!fontOpen)} className="p-1.5 rounded-lg hover:bg-accent" title="Font">Aa</button>
        {fontOpen && <FontPicker current={block?.properties} onSelect={(patch:any)=> { if (onChange) onChange({ properties:{ ...block.properties, ...patch }}) }} onClose={()=> setFontOpen(false)} />}
      </div>
      {onTurnInto && (
        <div className="relative">
          <button onClick={()=> setTurnOpen(!turnOpen)} className="p-1.5 rounded-lg hover:bg-accent text-xs" title="Turn into">↻</button>
          {turnOpen && (
            <div className="absolute left-0 top-full mt-1 w-[200px] bg-popover border rounded-xl shadow-xl p-1 z-30 max-h-[240px] overflow-auto">
              <div className="px-2 py-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Turn into</div>
              {BlockRegistry.all().slice(0,20).map(b=> (
                <button key={b.type} onClick={()=> { onTurnInto(b.type); setTurnOpen(false)}} className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${currentType===b.type ? 'bg-accent font-medium' : 'hover:bg-accent'}`}>
                  <span className="w-6 h-6 rounded bg-muted grid place-items-center text-[10px]">{b.slash.icon}</span>{b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button onClick={onDuplicate} className="p-1.5 rounded-lg hover:bg-accent" title="Duplicate"><Copy size={14}/></button>
      <button onClick={onColor} className="p-1.5 rounded-lg hover:bg-accent" title="Color"><Palette size={14}/></button>
      <button onClick={onComment} className="p-1.5 rounded-lg hover:bg-accent relative" title="Comment"><MessageSquare size={14}/>{commentCount ? <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 text-white text-[9px] rounded-full grid place-items-center">{commentCount}</span> : null}</button>
      <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-accent text-red-500" title="Delete"><Trash2 size={14}/></button>
    </div>
  )
}

function ColorPicker({ colors, current, onSelect, onClose }: { colors:{name:string, color:string, bg:string}[], current:any, onSelect:(c:any)=>void, onClose:()=>void }) {
  const [tab, setTab] = useState<'text'|'highlight'>('text')
  const textColors = [
    { name:'Default', value:'' },
    { name:'Black', value:'#111827' }, { name:'Gray', value:'#6b7280' }, { name:'Red', value:'#dc2626' },
    { name:'Orange', value:'#ea580c' }, { name:'Amber', value:'#d97706' }, { name:'Yellow', value:'#ca8a04' },
    { name:'Lime', value:'#65a30d' }, { name:'Green', value:'#16a34a' }, { name:'Emerald', value:'#059669' },
    { name:'Teal', value:'#0d9488' }, { name:'Cyan', value:'#0891b2' }, { name:'Sky', value:'#0284c7' },
    { name:'Blue', value:'#2563eb' }, { name:'Indigo', value:'#4f46e5' }, { name:'Violet', value:'#7c3aed' },
    { name:'Purple', value:'#9333ea' }, { name:'Fuchsia', value:'#c026d3' }, { name:'Pink', value:'#db2777' }, { name:'Rose', value:'#e11d48' },
  ]
  const bgColors = [
    { name:'Default', value:'' },
    { name:'Gray', value:'#f3f4f6' }, { name:'Yellow', value:'#fef9c3' }, { name:'Orange', value:'#ffedd5' },
    { name:'Red', value:'#fee2e2' }, { name:'Green', value:'#dcfce7' }, { name:'Emerald', value:'#d1fae5' },
    { name:'Teal', value:'#ccfbf1' }, { name:'Cyan', value:'#cffafe' }, { name:'Sky', value:'#e0f2fe' },
    { name:'Blue', value:'#dbeafe' }, { name:'Indigo', value:'#e0e7ff' }, { name:'Violet', value:'#ede9fe' },
    { name:'Purple', value:'#f3e8ff' }, { name:'Fuchsia', value:'#fae8ff' }, { name:'Pink', value:'#fce7f3' }, { name:'Rose', value:'#ffe4e6' },
  ]
  return (
    <div className="absolute right-0 top-full mt-2 z-20 bg-popover border rounded-2xl shadow-xl p-3 w-[300px]">
      <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold">Text color & highlight</span><button onClick={onClose} className="p-1 hover:bg-accent rounded text-xs">✕</button></div>
      <div className="flex items-center gap-1 p-1 bg-muted rounded-xl mb-3">
        <button onClick={()=> setTab('text')} className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab==='text' ? 'bg-background shadow border' : 'hover:bg-accent'}`}>Text</button>
        <button onClick={()=> setTab('highlight')} className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab==='highlight' ? 'bg-background shadow border' : 'hover:bg-accent'}`}>Highlight</button>
      </div>
      {tab==='text' ? (
        <>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Text color</div>
          <div className="grid grid-cols-6 gap-1.5">
            {textColors.map(c=> (
              <button key={c.name+c.value} onClick={()=> onSelect({ color: c.value, bg: current?.background || '' })} title={c.name} className={`h-8 rounded-lg border grid place-items-center text-xs font-bold ${current?.color===c.value ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`} style={{ background: c.value || 'white', color: c.value ? 'white' : '#111827', borderColor: c.value || '#e5e7eb' }}>
                A
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <input type="color" value={current?.color || '#000000'} onChange={e=> onSelect({ color: e.target.value, bg: current?.background || '' })} className="w-8 h-8 rounded-lg border p-0.5 bg-background cursor-pointer" title="Custom text color" />
            <span className="text-xs text-muted-foreground flex-1 truncate">{current?.color || 'Default'}</span>
            <button onClick={()=> onSelect({ color: '', bg: current?.background || '' })} className="text-xs border rounded-lg px-2 py-1 hover:bg-accent">Clear text</button>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">Tip: Use Font Aa menu for Caveat + color preview together</div>
        </>
      ) : (
        <>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Highlight (background)</div>
          <div className="grid grid-cols-6 gap-1.5">
            {bgColors.map(c=> (
              <button key={c.name+c.value} onClick={()=> onSelect({ color: current?.color || '', bg: c.value })} title={c.name} className={`h-8 rounded-lg border grid place-items-center text-xs font-medium ${current?.background===c.value ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`} style={{ background: c.value || 'white', color: c.value ? '#111827' : '#9ca3af', borderColor: c.value || '#e5e7eb' }}>
                A
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <input type="color" value={current?.background || '#ffffff'} onChange={e=> onSelect({ color: current?.color || '', bg: e.target.value })} className="w-8 h-8 rounded-lg border p-0.5 bg-background cursor-pointer" title="Custom highlight" />
            <span className="text-xs text-muted-foreground flex-1 truncate">{current?.background || 'Default'}</span>
            <button onClick={()=> onSelect({ color: current?.color || '', bg: '' })} className="text-xs border rounded-lg px-2 py-1 hover:bg-accent">Clear bg</button>
          </div>
        </>
      )}
      <div className="mt-3 p-2 rounded-xl border bg-muted/20 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Preview:</span>
        <span className="px-2 py-1 rounded text-sm font-medium truncate flex-1" style={{ color: current?.color || undefined, background: current?.background || undefined, fontFamily: current?.fontFamily==='caveat' ? "'Caveat', cursive" : undefined }}>Aa The quick brown fox</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-3">
        <span className="text-[10px] text-muted-foreground col-span-3">Quick palettes (sets both)</span>
        {colors.slice(0,6).map(c=> (
          <button key={c.name} onClick={()=> onSelect(c)} title={c.name} className="h-7 rounded-lg border flex items-center justify-center text-[10px] font-medium truncate px-1" style={{ background: c.bg||'white', color: c.color||'black', borderColor: current?.color===c.color && current?.background===c.bg ? '#8b5cf6' : '#e5e7eb', borderWidth: current?.color===c.color && current?.background===c.bg ? 2 : 1 }}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-3">
        <button onClick={()=> onSelect({ color:'', bg:''})} className="text-xs border rounded-lg py-1.5 hover:bg-accent">Clear all</button>
        <button onClick={onClose} className="text-xs bg-primary text-primary-foreground rounded-lg py-1.5">Done</button>
      </div>
    </div>
  )
}

function CommentModal({ open, onClose, blockId }: { open:boolean, onClose:()=>void, blockId:string }) {
  const [text, setText] = useState('')
  const { addComment, user, comments } = useAppStore()
  const blockComments = comments.filter(c=> c.blockId===blockId)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-popover border rounded-2xl shadow-xl w-full max-w-md m-4 p-4">
        <h3 className="font-semibold text-sm mb-2">Comments for block</h3>
        <div className="space-y-2 max-h-[200px] overflow-auto mb-3">
          {blockComments.length===0 && <div className="text-xs text-muted-foreground py-4 text-center border rounded-xl border-dashed">No comments yet</div>}
          {blockComments.map(c=> (
            <div key={c.id} className="p-2 rounded-xl bg-muted border text-sm">
              <div className="text-xs text-muted-foreground">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</div>
              <div>{c.content}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={text} onChange={e=> setText(e.target.value)} placeholder="Add comment... @mention" className="flex-1 h-9 rounded-xl border bg-background px-3 text-sm" />
          <Button disabled={!text.trim()} onClick={()=> { addComment({ blockId, authorId: user.id, content: text, pageId: undefined, recordId: undefined, parentId: null } as any); setText(''); }}>Send</Button>
        </div>
        <div className="flex justify-end mt-3"><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
      </div>
    </div>
  )
}

function FileUploadSimple({ onUpload, accept='*/*' }: { onUpload:(url:string)=>void, accept?:string }) {
  const [uploading, setUploading] = useState(false)
  const { push } = useToast()
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { url } = await storageService.getActive().upload(file)
      onUpload(url)
      push({ title:'File uploaded', desc: file.name })
    } catch(err:any) { push({ title:'Upload failed', desc: String(err.message) }) }
    setUploading(false)
  }
  return (
    <div className="rounded-xl border border-dashed p-4 bg-muted/20 mt-2">
      <label className="flex items-center gap-2 p-3 rounded-xl border bg-background hover:bg-accent cursor-pointer justify-center">
        <input type="file" accept={accept} hidden onChange={handleFile} />
        <span className="text-sm font-medium">{uploading ? 'Uploading...' : 'Upload file'}</span>
      </label>
    </div>
  )
}

function ImageUpload({ onUpload, onUrl }: { onUpload:(url:string)=>void, onUrl:(url:string)=>void }) {
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const { push } = useToast()
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { url } = await storageService.getActive().upload(file)
      onUpload(url)
      push({ title:'Image uploaded', desc: file.name })
    } catch(err:any) { push({ title:'Upload failed', desc: String(err.message) }) }
    setUploading(false)
  }
  return (
    <div className="rounded-xl border border-dashed p-4 bg-muted/20">
      <div className="flex items-center gap-2 text-sm font-medium"><ImageIcon size={16}/> Add image</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border bg-background hover:bg-accent cursor-pointer">
          <input type="file" accept="image/*" hidden onChange={handleFile} />
          <span className="text-xs font-medium">{uploading ? 'Uploading...' : 'Upload file'}</span>
          <span className="text-[11px] text-muted-foreground">PNG, JPG, GIF</span>
        </label>
        <div className="p-3 rounded-xl border bg-background">
          <div className="text-xs font-medium mb-1">Or paste URL</div>
          <div className="flex gap-1">
            <input value={url} onChange={e=> setUrl(e.target.value)} placeholder="https://..." className="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-background" />
            <Button size="sm" disabled={!url} onClick={()=> onUrl(url)}>Add</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TableBlock({ content, onChange }: { content:string, onChange:(html:string)=>void }) {
  const parseContent = (): { columns: any[], rows: any[] } => {
    try {
      const parsed = content ? JSON.parse(content) : null
      if (parsed && parsed.columns && parsed.rows) return parsed
      if (Array.isArray(parsed)) {
        const header = parsed[0] || ['Task','Status','Progress']
        const columns = header.map((h:string,i:number)=> ({ id: 'c'+i, name: h || 'Col '+(i+1), type: i===1 ? 'select' : i===2 ? 'progress' : 'text', options: i===1 ? ['Todo','Doing','Done'] : undefined }))
        const rows = parsed.slice(1).map((r:any[], idx:number)=> ({ id: 'r'+idx, cells: Object.fromEntries(columns.map((c:any, ci:number)=> [c.id, r[ci]||''])) }))
        if (rows.length===0) rows.push({ id: 'r0', cells: Object.fromEntries(columns.map((c:any)=> [c.id, c.type==='progress' ? 0 : ''])) })
        return { columns, rows }
      }
    } catch {}
    return {
      columns: [
        { id: 'c0', name: 'Task', type: 'text' },
        { id: 'c1', name: 'Status', type: 'select', options: ['Todo','Doing','Done'] },
        { id: 'c2', name: 'Progress', type: 'progress' },
        { id: 'c3', name: 'Due', type: 'date' },
        { id: 'c4', name: 'Timer', type: 'timer' },
        { id: 'c5', name: 'Cycle', type: 'cycle' },
      ],
      rows: [{ id: 'r0', cells: { c0: '', c1: 'Todo', c2: 0, c3: '', c4: { elapsed: 0, running: false }, c5: { frequency: 'daily', target: 1, completed: 0 } } }]
    }
  }
  const [data, setData] = useState<{ columns:any[], rows:any[] }>(()=> parseContent())
  const [tick, setTick] = useState(0)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [menuCol, setMenuCol] = useState<string | null>(null)

  const getCycleTarget = (freq: string): number => {
    switch(freq) {
      case 'once': return 1
      case 'daily': return 1
      case '2x/day': return 2
      case '3x/day': return 3
      case 'weekly': return 1
      case '2x/week': return 2
      case '3x/week': return 3
      case 'biweekly': return 1
      case 'monthly': return 1
      case 'custom': return 1
      default: return 1
    }
  }
  const normalizeCycleCell = (cell: any): { frequency: string, target: number, completed: number } => {
    if (!cell) return { frequency: 'daily', target: 1, completed: 0 }
    if (typeof cell === 'string') {
      const freq = cell
      return { frequency: freq, target: getCycleTarget(freq), completed: 0 }
    }
    if (typeof cell === 'object' && cell.frequency) {
      return {
        frequency: cell.frequency || 'daily',
        target: typeof cell.target === 'number' ? cell.target : getCycleTarget(cell.frequency),
        completed: typeof cell.completed === 'number' ? cell.completed : 0,
      }
    }
    return { frequency: 'daily', target: 1, completed: 0 }
  }
  const handleCycleUpdate = (rowId: string, colId: string, newCycle: any, progressColId?: string) => {
    const target = Math.max(1, newCycle.target || 1)
    const completed = Math.max(0, Math.min(target, newCycle.completed ?? 0))
    const pct = target ? Math.round((completed / target) * 100) : 0
    setData(d=> {
      const newRows = d.rows.map((r:any)=> {
        if (r.id !== rowId) return r
        const newCells: any = { ...r.cells, [colId]: { frequency: newCycle.frequency, target, completed } }
        if (progressColId) {
          newCells[progressColId] = pct
        }
        return { ...r, cells: newCells }
      })
      return { ...d, rows: newRows }
    })
  }
  const getProgressColor = (v: number) => {
    if (v >= 80) return '#10b981'
    if (v >= 50) return '#8b5cf6'
    if (v >= 30) return '#f59e0b'
    if (v > 0) return '#ef4444'
    return '#e5e7eb'
  }
  useEffect(()=> {
    const hasRunning = data.rows.some((r:any)=> Object.values(r.cells).some((v:any)=> v && typeof v==='object' && v.running))
    if (!hasRunning) return
    const id = setInterval(()=> setTick(t=> t+1), 1000)
    return ()=> clearInterval(id)
  }, [data])
  useEffect(()=> { onChange(JSON.stringify(data)) }, [data])
  const updateCell = (rowId:string, colId:string, val:any)=> {
    setData(d=> ({ ...d, rows: d.rows.map((r:any)=> r.id===rowId ? { ...r, cells:{ ...r.cells, [colId]: val } } : r) }))
  }
  const updateColumn = (colId:string, patch:any)=> {
    setData(d=> ({ ...d, columns: d.columns.map((c:any)=> c.id===colId ? { ...c, ...patch } : c) }))
  }
  const addRow = ()=> {
    const newRow = { id: 'r'+Date.now(), cells: Object.fromEntries(data.columns.map((c:any)=> [c.id, c.type==='progress' ? 0 : c.type==='timer' ? { elapsed:0, running:false } : c.type==='cycle' ? { frequency:'daily', target:1, completed:0 } : c.type==='select' ? c.options?.[0]||'' : ''])) }
    setData(d=> ({ ...d, rows: [...d.rows, newRow] }))
  }
  const addCol = (type:string='text')=> {
    const id = 'c'+Date.now()
    const name = type.charAt(0).toUpperCase()+type.slice(1)
    setData(d=> ({ ...d, columns: [...d.columns, { id, name, type, options: type==='select'||type==='status' ? ['Option 1','Option 2'] : undefined }], rows: d.rows.map((r:any)=> ({ ...r, cells:{ ...r.cells, [id]: type==='progress' ? 0 : type==='timer' ? { elapsed:0, running:false } : type==='cycle' ? { frequency:'daily', target:1, completed:0 } : '' } })) }))
  }
  const deleteCol = (colId:string)=> {
    setData(d=> ({ ...d, columns: d.columns.filter((c:any)=> c.id!==colId), rows: d.rows.map((r:any)=> { const c={...r.cells}; delete c[colId]; return { ...r, cells:c } }) }))
  }
  const deleteRow = (rowId:string)=> setData(d=> ({ ...d, rows: d.rows.filter((r:any)=> r.id!==rowId) }))
  const duplicateRow = (rowId:string)=> {
    const row = data.rows.find((r:any)=> r.id===rowId)
    if (!row) return
    setData(d=> ({ ...d, rows: [...d.rows, { ...row, id: 'r'+Date.now(), cells:{ ...row.cells } }] }))
  }

  const formatTimer = (cell:any) => {
    if (!cell || typeof cell !== 'object') return '0:00'
    const elapsed = cell.running && cell.start ? cell.elapsed + Math.floor((Date.now() - cell.start)/1000) : cell.elapsed || 0
    const m = Math.floor(elapsed/60)
    const s = elapsed%60
    return `${m}:${String(s).padStart(2,'0')}`
  }
  const toggleTimer = (rowId:string, colId:string) => {
    setData(d=> ({ ...d, rows: d.rows.map((r:any)=> {
      if (r.id!==rowId) return r
      const cell = r.cells[colId] || { elapsed:0, running:false }
      if (cell.running) {
        const now = Date.now()
        const elapsed = cell.elapsed + Math.floor((now - (cell.start||now))/1000)
        return { ...r, cells:{ ...r.cells, [colId]: { elapsed, running:false } } }
      } else {
        return { ...r, cells:{ ...r.cells, [colId]: { elapsed: cell.elapsed||0, running:true, start: Date.now() } } }
      }
    })}))
  }
  const resetTimer = (rowId:string, colId:string) => {
    setData(d=> ({ ...d, rows: d.rows.map((r:any)=> r.id===rowId ? { ...r, cells:{ ...r.cells, [colId]: { elapsed:0, running:false } } } : r)}))
  }
  const getCycleNext = (cycle:string, last?:string) => {
    const base = last ? new Date(last) : new Date()
    if (!cycle || cycle==='once') return '—'
    if (cycle==='daily') { const n=new Date(base); n.setDate(n.getDate()+1); return n.toLocaleDateString() }
    if (cycle==='2x/day') { const n=new Date(base); n.setHours(n.getHours()+12); return n.toLocaleString() }
    if (cycle==='3x/day') { const n=new Date(base); n.setHours(n.getHours()+8); return n.toLocaleString() }
    if (cycle==='weekly') { const n=new Date(base); n.setDate(n.getDate()+7); return n.toLocaleDateString() }
    if (cycle==='2x/week') { const n=new Date(base); n.setDate(n.getDate()+3); return n.toLocaleDateString() }
    if (cycle==='3x/week') { const n=new Date(base); n.setDate(n.getDate()+2); return n.toLocaleDateString() }
    if (cycle==='biweekly') { const n=new Date(base); n.setDate(n.getDate()+14); return n.toLocaleDateString() }
    if (cycle==='monthly') { const n=new Date(base); n.setMonth(n.getMonth()+1); return n.toLocaleDateString() }
    if (cycle==='2x/month') { const n=new Date(base); n.setDate(n.getDate()+15); return n.toLocaleDateString() }
    if (cycle==='custom') { const n=new Date(base); n.setDate(n.getDate()+1); return n.toLocaleDateString() + ' (custom)' }
    return '—'
  }

  return (
    <div className="rounded-xl border bg-background w-full max-w-full relative group/table overflow-visible">
      <button
        onClick={()=> setShowTableMenu(!showTableMenu)}
        className={`absolute right-2 top-2 z-10 p-1.5 rounded-lg text-xs transition-all ${showTableMenu ? 'bg-muted text-foreground opacity-100' : 'text-muted-foreground/70 opacity-0 group-hover/table:opacity-100 hover:bg-muted hover:text-foreground'}`}
        title="Table options"
      >
        <Settings size={14}/>
      </button>
      {showTableMenu && (
        <div className="absolute right-3 top-11 z-20 w-[300px] max-w-[85vw] max-h-[70vh] overflow-auto bg-popover border rounded-2xl shadow-xl p-3 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1"><SlidersHorizontal size={12}/> Table options</span>
            <button onClick={()=> setShowTableMenu(false)} className="p-1 hover:bg-accent rounded-lg text-xs">✕</button>
          </div>
          <div className="space-y-2">
            <Button variant="ghost" size="sm" onClick={()=> { addRow(); setShowTableMenu(false)}} className="w-full justify-start"><TableIcon size={12} className="mr-1"/> Add row</Button>
            <div className="text-[11px] font-medium text-muted-foreground">Add column</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={()=> { addCol('text'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><Type size={12}/> Text</button>
              <button onClick={()=> { addCol('number'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><Hash size={12}/> Number</button>
              <button onClick={()=> { addCol('select'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><BarChart3 size={12}/> Select</button>
              <button onClick={()=> { addCol('date'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><Calendar size={12}/> Date</button>
              <button onClick={()=> { addCol('progress'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><BarChart3 size={12} className="text-violet-500"/> Progress</button>
              <button onClick={()=> { addCol('timer'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><Timer size={12} className="text-amber-500"/> Timer</button>
              <button onClick={()=> { addCol('cycle'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><Repeat2 size={12} className="text-emerald-500"/> Cycle</button>
              <button onClick={()=> { addCol('checkbox'); setShowTableMenu(false)}} className="px-2 py-1.5 rounded-lg border hover:bg-accent text-xs flex items-center gap-1 justify-center"><CheckSquare size={12}/> Check</button>
            </div>
            <div className="pt-2 border-t space-y-1 text-xs">
              <div className="flex items-center justify-between text-muted-foreground"><span>Rows</span><span className="font-medium text-foreground">{data.rows.length}</span></div>
              <div className="flex items-center justify-between text-muted-foreground"><span>Columns</span><span className="font-medium text-foreground">{data.columns.length}</span></div>
              <div className="flex items-center justify-between text-muted-foreground"><span>Avg progress</span><span className="font-medium text-foreground">{Math.round(data.rows.reduce((a:any,r:any)=> a + (Number(r.cells[data.columns.find((c:any)=> c.type==='progress')?.id]||0)),0)/Math.max(1,data.rows.length))}%</span></div>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-full overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[540px] sm:min-w-0">
          <colgroup>
            <col style={{ width: '24px' }} />
            {data.columns.map((col:any)=> (
              <col key={col.id} style={{ width: `${Math.max(11, 88 / Math.max(1, data.columns.length))}%` }} />
            ))}
            <col style={{ width: '56px' }} />
          </colgroup>
          <thead>
            <tr className="border-b text-[13px] font-normal text-muted-foreground">
              <th className="w-6 p-1.5"></th>
              {data.columns.map((col:any)=> (
                <th key={col.id} className="group/col relative text-left p-1 max-w-[220px]">
                  <div className="flex items-center gap-1.5 min-w-0 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                    <span className="shrink-0 text-muted-foreground/70">{col.type==='text' && <Type size={12}/>}{col.type==='number' && <Hash size={12}/>}{col.type==='checkbox' && <CheckSquare size={12}/>}{col.type==='select' && <BarChart3 size={12}/>}{col.type==='progress' && <BarChart3 size={12}/>}{col.type==='timer' && <Timer size={12}/>}{col.type==='cycle' && <Repeat2 size={12}/>}{col.type==='date' && <Calendar size={12}/>}</span>
                      <input value={col.name} onChange={e=> updateColumn(col.id, { name:e.target.value })} placeholder="Untitled" className="bg-transparent outline-none flex-1 min-w-0 truncate text-foreground placeholder:text-muted-foreground/50" />
                    <button onClick={()=> setMenuCol(menuCol===col.id ? null : col.id)} className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground opacity-0 group-hover/col:opacity-100" title="Column menu">
                      <ChevronDown size={12}/>
                    </button>
                  </div>
                  {menuCol===col.id && (
                    <span className="block text-left" onClick={e=> e.stopPropagation()}>
                      <span className="fixed inset-0 z-30 cursor-default" onClick={()=> setMenuCol(null)} />
                      <span className="absolute left-0 top-full z-40 block w-[210px] rounded-xl border bg-popover p-2 text-foreground shadow-xl">
                        <span className="mb-1 block px-1 text-[11px] font-medium text-muted-foreground">Property type</span>
                        <select value={col.type} onChange={e=> updateColumn(col.id, { type:e.target.value })} className="h-8 w-full rounded-lg border bg-background px-2 text-[13px] outline-none">
                          <option value="text">Text</option><option value="number">Number</option><option value="checkbox">Checkbox</option><option value="select">Select</option><option value="date">Date</option><option value="progress">Progress</option><option value="timer">Timer</option><option value="cycle">Cycle</option><option value="status">Status</option>
                        </select>
                        <span className="my-2 block h-px bg-border" />
                        <button onClick={()=> { deleteCol(col.id); setMenuCol(null) }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-500/10">✕ Delete column</button>
                      </span>
                    </span>
                  )}
                </th>
              ))}
              <th className="w-14 p-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row:any)=> (
              <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 group">
                <td className="p-1 text-center align-middle">
                  <span className="w-1.5 h-1.5 rounded-full bg-border inline-block group-hover:bg-muted-foreground/40" />
                </td>
                {data.columns.map((col:any)=> (
                  <td key={col.id} className="p-1.5 align-middle max-w-[200px] min-w-0">
                    {col.type==='text' && <input value={row.cells[col.id]||''} onChange={e=> updateCell(row.id, col.id, e.target.value)} placeholder="Empty" className="w-full min-w-0 bg-transparent outline-none text-sm truncate placeholder:text-muted-foreground/0 hover:placeholder:text-muted-foreground/50 focus:placeholder:text-muted-foreground/50 px-1 py-0.5 rounded-md focus:bg-muted/50" />}
                    {col.type==='number' && <input type="number" value={row.cells[col.id]||''} onChange={e=> updateCell(row.id, col.id, e.target.value)} placeholder="Empty" className="w-full min-w-0 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/0 hover:placeholder:text-muted-foreground/50 px-1 py-0.5 rounded-md focus:bg-muted/50" />}
                    {col.type==='checkbox' && <span className="flex items-center justify-center"><input type="checkbox" checked={!!row.cells[col.id]} onChange={e=> updateCell(row.id, col.id, e.target.checked)} className="rounded accent-violet-500 h-4 w-4" /></span>}
                    {(col.type==='select' || col.type==='status') && (
                      <select value={row.cells[col.id]||''} onChange={e=> updateCell(row.id, col.id, e.target.value)} className="w-full min-w-0 bg-transparent text-[13px] rounded-md px-1 py-1 truncate outline-none hover:bg-muted/60">
                        <option value="">Empty</option>
                        {(col.options||['Todo','Doing','Done']).map((o:string)=> <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {col.type==='date' && <input type="date" value={row.cells[col.id]||''} onChange={e=> updateCell(row.id, col.id, e.target.value)} className="w-full min-w-0 bg-transparent text-[13px] outline-none rounded-md px-1 py-0.5 hover:bg-muted/60" />}
                    {col.type==='progress' && (() => {
                      const val = Math.max(0, Math.min(100, Number(row.cells[col.id]||0)))
                      const color = getProgressColor(val)
                      const circumference = 2 * Math.PI * 15.5
                      const offset = circumference * (1 - val/100)
                      return (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative w-9 h-9 shrink-0">
                            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-muted" />
                              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: offset, transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }} />
                            </svg>
                            <span className="absolute inset-0 grid place-items-center text-[9px] font-bold" style={{ color: val>0 ? color : '#6b7280' }}>{val}%</span>
                          </div>
                          <input type="range" min={0} max={100} value={val} onChange={e=> updateCell(row.id, col.id, Number(e.target.value))} className="flex-1 min-w-0 hidden sm:block accent-violet-500 h-1.5" />
                          <input type="number" min={0} max={100} value={val} onChange={e=> updateCell(row.id, col.id, Number(e.target.value))} className="w-12 text-xs border rounded px-1 py-0.5 bg-background text-foreground sm:hidden" />
                        </div>
                      )
                    })()}
                    {col.type==='timer' && (
                      <div className="flex items-center gap-1 min-w-0 flex-wrap">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{formatTimer(row.cells[col.id])}</span>
                        <button onClick={()=> toggleTimer(row.id, col.id)} className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${row.cells[col.id]?.running ? 'bg-amber-500 text-white' : 'bg-muted hover:bg-accent'}`}>{row.cells[col.id]?.running ? 'Pause' : 'Start'}</button>
                        <button onClick={()=> resetTimer(row.id, col.id)} className="p-1 hover:bg-accent rounded text-xs shrink-0 hidden sm:inline">Reset</button>
                      </div>
                    )}
                    {col.type==='cycle' && (() => {
                      const norm = normalizeCycleCell(row.cells[col.id])
                      const progressId = data.columns.find((c:any)=> c.type==='progress')?.id
                      const target = norm.target
                      const completed = norm.completed
                      const pct = target ? Math.round((completed/target)*100) : 0
                      return (
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <select value={norm.frequency} onChange={e=> {
                            const freq=e.target.value
                            const newTarget = getCycleTarget(freq)
                            handleCycleUpdate(row.id, col.id, { frequency: freq, target: newTarget, completed: 0 }, progressId)
                          }} className="text-xs border rounded px-1 py-0.5 bg-background text-foreground truncate w-full">
                            <option value="once">Once</option>
                            <option value="daily">Daily</option>
                            <option value="2x/day">2× / day</option>
                            <option value="3x/day">3× / day</option>
                            <option value="weekly">Weekly</option>
                            <option value="2x/week">2× / week</option>
                            <option value="3x/week">3× / week</option>
                            <option value="biweekly">Biweekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="custom">Custom</option>
                          </select>
                          {norm.frequency==='custom' && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">Target:</span>
                              <input type="number" min={1} max={20} value={target} onChange={e=> {
                                const t=Math.max(1, Math.min(20, Number(e.target.value)||1))
                                handleCycleUpdate(row.id, col.id, { ...norm, target:t, completed: Math.min(completed, t) }, progressId)
                              }} className="w-14 text-xs border rounded px-1.5 py-1 bg-background text-foreground" />
                              <span className="text-[10px] text-muted-foreground">times</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Done:</span>
                            <input
                              type="number"
                              min={0}
                              max={target}
                              value={completed}
                              onChange={e=> {
                                const v = Math.max(0, Math.min(target, Number(e.target.value)||0))
                                handleCycleUpdate(row.id, col.id, { ...norm, completed: v }, progressId)
                              }}
                              className="w-14 text-xs border rounded px-1.5 py-1 bg-background text-foreground text-center font-mono"
                              placeholder="0"
                            />
                            <span className="text-[10px] font-mono">/ {target}</span>
                            <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold border" style={{ background: getProgressColor(pct)+'18', color: getProgressColor(pct), borderColor: getProgressColor(pct)+'30' }}>{pct}%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={()=> handleCycleUpdate(row.id, col.id, { ...norm, completed: Math.min(target, completed+1) }, progressId)} disabled={completed>=target} className="flex-1 text-[11px] px-2 py-1 rounded-lg bg-violet-500 text-white disabled:opacity-40 hover:bg-violet-600 flex items-center justify-center gap-1 font-medium">✓ Did it</button>
                            <button onClick={()=> handleCycleUpdate(row.id, col.id, { ...norm, completed: 0 }, progressId)} className="text-[11px] px-2 py-1 rounded-lg border hover:bg-accent">Reset</button>
                          </div>
                          <span className="text-[10px] text-muted-foreground truncate">Next: {getCycleNext(norm.frequency, row.cells[data.columns.find((c:any)=> c.type==='date')?.id])}</span>
                        </div>
                      )
                    })()}
                  </td>
                ))}
                <td className="p-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <button onClick={()=> duplicateRow(row.id)} className="p-1 hover:bg-muted rounded text-muted-foreground" title="Duplicate">⎘</button>
                  <button onClick={()=> deleteRow(row.id)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-red-600" title="Delete">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-2 py-1 border-t border-border/50 flex items-center gap-2">
        <button onClick={addRow} className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-muted-foreground/80 hover:text-muted-foreground rounded-md hover:bg-muted/40">+ New</button>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground/60">{data.rows.length}</span>
      </div>
    </div>
  )
}

function placeholderFor(type: string) {
  switch(type) {
    case 'heading1': return 'Heading 1'
    case 'heading2': return 'Heading 2'
    case 'heading3': return 'Heading 3'
    case 'bulleted_list': return 'List item'
    case 'numbered_list': return 'List item'
    case 'todo': return 'To-do'
    case 'quote': return 'Write a quote...'
    case 'code': return 'Write code...'
    case 'callout': return 'Callout text...'
    case 'toggle': return 'Toggle title...'
    default: return 'Type "/" for commands, or start writing...'
  }
}

function FloatingToolbar({ onFormat }: { onFormat:(cmd:string)=>void }) {
  return (
    <div className="absolute -top-10 left-0 flex items-center gap-1 bg-popover border rounded-xl shadow-lg p-1 z-10">
      <button onMouseDown={e=>{e.preventDefault(); onFormat('bold')}} className="px-2 py-1 rounded-lg hover:bg-accent font-bold text-sm">B</button>
      <button onMouseDown={e=>{e.preventDefault(); onFormat('italic')}} className="px-2 py-1 rounded-lg hover:bg-accent italic text-sm">I</button>
      <button onMouseDown={e=>{e.preventDefault(); onFormat('underline')}} className="px-2 py-1 rounded-lg hover:bg-accent underline text-sm">U</button>
      <button onMouseDown={e=>{e.preventDefault(); onFormat('strikeThrough')}} className="px-2 py-1 rounded-lg hover:bg-accent line-through text-sm">S</button>
      <button onMouseDown={e=>{e.preventDefault(); onFormat('insertUnorderedList')}} className="px-2 py-1 rounded-lg hover:bg-accent text-sm">• List</button>
      <button onMouseDown={e=>{e.preventDefault(); const url=prompt('Enter URL'); if(url) document.execCommand('createLink', false, url); onFormat('')}} className="px-2 py-1 rounded-lg hover:bg-accent text-sm">Link</button>
      <span className="text-xs border rounded px-1 ml-1">⌘B ⌘I</span>
    </div>
  )
}

function SlashMenu({ query, onSelect, onClose }: { query:string, onSelect:(t:string)=>void, onClose:()=>void }) {
  const cmds = BlockRegistry.slashCommands()
  const filtered = query ? cmds.filter(c=> c.title.toLowerCase().includes(query.toLowerCase()) || c.keywords.some(k=> k.includes(query.toLowerCase())) ) : cmds
  const [idx, setIdx] = useState(0)
  useEffect(()=> {
    const h = (e:KeyboardEvent)=> {
      if (e.key==='ArrowDown') { e.preventDefault(); setIdx(i=> Math.min(i+1, filtered.length-1))}
      if (e.key==='ArrowUp') { e.preventDefault(); setIdx(i=> Math.max(i-1,0))}
      if (e.key==='Enter') { e.preventDefault(); if(filtered[idx]) onSelect(filtered[idx].blockType)}
      if (e.key==='Escape') onClose()
    }
    window.addEventListener('keydown', h); return ()=> window.removeEventListener('keydown', h)
  }, [idx, filtered])
  useEffect(()=> setIdx(0), [query])
  return (
    <div className="absolute left-0 top-full mt-2 w-[340px] bg-popover border rounded-2xl shadow-xl p-2 z-20 max-h-[360px] overflow-auto">
      <div className="px-2 py-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Slash commands — {filtered.length} {filtered.length>20 ? '(showing 20)' : ''}</div>
      {filtered.slice(0,20).map((c,i)=> (
        <button key={c.id} onMouseDown={e=>{e.preventDefault(); onSelect(c.blockType)}} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left ${i===idx ? 'bg-accent' : 'hover:bg-accent'}`}>
          <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center text-xs font-mono">{c.icon}</span>
          <span className="flex-1">
            <div className="text-sm font-medium">{c.title}</div>
            <div className="text-xs text-muted-foreground">{c.description}</div>
          </span>
          {c.shortcut && <span className="text-xs border rounded px-1">{c.shortcut}</span>}
        </button>
      ))}
      {filtered.length===0 && <div className="p-4 text-sm text-muted-foreground text-center">No commands matching “{query}”</div>}
    </div>
  )
}

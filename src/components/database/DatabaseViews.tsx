import { useState, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { Database, DatabaseRecord, FilterGroup, FilterCondition } from '@/lib/types'
import { evaluateFilter, sortRecords, groupRecords } from '@/lib/databaseEngine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/input'
import { Plus, Filter, ArrowUpDown, Eye, MoreHorizontal, Calendar, LayoutGrid, List, Table as TableIcon, Kanban, Clock, GanttChart, Settings, SlidersHorizontal, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

export function DatabaseViews({ database, compact }: { database: Database, compact?: boolean }) {
  const { records, createRecord, updateRecord, deleteRecord } = useAppStore()
  const dbRecords = records.filter(r=> r.databaseId===database.id)
  const [viewType, setViewType] = useState(database.views[0]?.type || 'table')
  const view = database.views.find(v=> v.type===viewType) || database.views[0]
  const [filterQ, setFilterQ] = useState('')
  const [newRow, setNewRow] = useState<Record<string, any>>({})
  const [sort, setSort] = useState<{propertyId:string, direction:'asc'|'desc'} | null>(null)
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>(view?.filter)
  const [showFilter, setShowFilter] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())
  const [showControls, setShowControls] = useState(false)

  const filtered = useMemo(()=> {
    let recs = dbRecords
    const activeFilter = filterGroup || view?.filter
    if (activeFilter) recs = recs.filter(r=> evaluateFilter(r, activeFilter))
    if (filterQ) recs = recs.filter(r=> Object.values(r.properties).some(v=> String(v).toLowerCase().includes(filterQ.toLowerCase())))
    if (sort) recs = sortRecords(recs, [sort])
    else if (view?.sort) recs = sortRecords(recs, view.sort)
    return recs
  }, [dbRecords, view, filterQ, sort, filterGroup])

  const handleAdd = () => {
    const props: Record<string, unknown> = {}
    database.properties.forEach(p=> props[p.id]= newRow[p.id] ?? (p.type==='status' ? p.options?.[0] : p.type==='checkbox' ? false : ''))
    if (!props[database.properties[0].id]) props[database.properties[0].id] = 'Untitled'
    createRecord(database.id, props)
    setNewRow({})
  }

  const toggleHide = (id:string) => {
    setHiddenCols(s=> {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <div className={cn("space-y-3 w-full max-w-full", compact && "space-y-2")}>
      <div className={cn("flex flex-wrap items-center gap-2 w-full max-w-full relative", compact && "gap-1 px-1")}>
        <div className={cn("flex items-center gap-1 p-1 rounded-xl border bg-muted/20 overflow-auto flex-1 max-w-full", compact && "p-0.5")}>
          {(['table','board','gallery','calendar','list','timeline'] as const).map(t=> (
            <button key={t} onClick={()=> setViewType(t as any)} className={cn(`px-3 py-1.5 rounded-lg text-xs font-medium capitalize flex items-center gap-1.5 shrink-0 ${viewType===t ? 'bg-background shadow border' : 'hover:bg-accent'}`, compact && "px-2 py-1 text-[11px]")}>
              {t==='table' && <TableIcon size={14}/>}
              {t==='board' && <Kanban size={14}/>}
              {t==='gallery' && <LayoutGrid size={14}/>}
              {t==='calendar' && <Calendar size={14}/>}
              {t==='list' && <List size={14}/>}
              {t==='timeline' && <Clock size={14}/>}
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {(filterGroup || sort || hiddenCols.size>0) && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-1">
              {filterGroup && <span>Filter•{filterGroup.conditions.length}</span>}
              {sort && <span>Sort</span>}
              {hiddenCols.size>0 && <span>Hidden•{hiddenCols.size}</span>}
            </span>
          )}
          <Button size="sm" className={cn(compact && "h-7 px-2 text-xs")} onClick={handleAdd}><Plus size={14} className={compact ? "" : "mr-1"}/> {compact ? "+" : "New"}</Button>
          <button
            onClick={()=> setShowControls(!showControls)}
            className={cn("p-2 rounded-xl border shadow-sm flex items-center gap-1.5 text-xs font-medium transition-colors", showControls ? "bg-accent border-violet-500/20" : "bg-card hover:bg-accent", compact && "p-1.5")}
            title="Table options"
          >
            <SlidersHorizontal size={14}/> <span className={cn(compact && "hidden")}>{showControls ? "Hide" : "Options"}</span>
          </button>
        </div>

        {showControls && (
          <div className="absolute right-0 top-full mt-2 z-20 w-[360px] max-w-[92vw] bg-popover border rounded-2xl shadow-xl p-3 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5"><Settings size={12}/> Table controls</span>
              <button onClick={()=> setShowControls(false)} className="p-1 hover:bg-accent rounded-lg"><X size={14}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">Search</div>
                <div className="relative">
                  <Input placeholder="Filter records..." value={filterQ} onChange={e=> setFilterQ(e.target.value)} className="h-8 pl-8 text-sm"/>
                  <Filter size={14} className="absolute left-2.5 top-2.5 text-muted-foreground"/>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Button variant={filterGroup ? "secondary" : "outline"} size="sm" className="text-xs" onClick={()=> setShowFilter(true)}><Filter size={12} className="mr-1"/> Filter</Button>
                <Button variant={sort ? "secondary" : "outline"} size="sm" className="text-xs" onClick={()=> setShowSort(true)}><ArrowUpDown size={12} className="mr-1"/> Sort</Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={()=> {
                  const id = prompt('Hide column id (e.g., '+database.properties.map(p=>p.id).join(', ')+') or "clear"')
                  if (id==='clear') setHiddenCols(new Set())
                  else if (id) toggleHide(id)
                }}><Eye size={12} className="mr-1"/> Hide</Button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{hiddenCols.size} hidden • {filtered.length} shown</span>
                <button onClick={()=> setHiddenCols(new Set())} className="ml-auto text-xs border rounded-lg px-2 py-1 hover:bg-accent">Show all</button>
              </div>
              <div className="pt-2 border-t">
                <div className="text-[11px] font-medium text-muted-foreground mb-1">Hidden columns</div>
                {hiddenCols.size===0 ? <div className="text-xs text-muted-foreground py-1">No hidden columns</div> : (
                  <div className="flex flex-wrap gap-1">
                    {Array.from(hiddenCols).map(id=> (
                      <span key={id} className="text-xs bg-muted border rounded-full px-2 py-1 flex items-center gap-1">{database.properties.find(p=>p.id===id)?.name || id} <button onClick={()=> toggleHide(id)} className="hover:bg-accent rounded px-1">✕</button></span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="pt-2 border-t flex justify-end">
              <Button size="sm" variant="ghost" onClick={()=> setShowControls(false)}>Done</Button>
            </div>
          </div>
        )}
      </div>

      {filterGroup && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
          <span className="font-medium">Filters: {filterGroup.op.toUpperCase()}</span>
          {(filterGroup.conditions as FilterCondition[]).map((c:any, i)=> (
            <span key={i} className="px-2 py-1 rounded-full bg-white border text-xs">{database.properties.find(p=>p.id===c.propertyId)?.name} {c.operator} {String(c.value)}</span>
          ))}
          <button onClick={()=> setFilterGroup(undefined)} className="ml-auto px-2 py-1 rounded-full bg-white border text-xs">Clear</button>
        </div>
      )}

      {viewType==='table' && <TableView database={database} records={filtered} hiddenCols={hiddenCols} onUpdate={updateRecord} onDelete={deleteRecord} onSort={(pid)=> setSort({ propertyId: pid, direction: sort?.direction==='asc' ? 'desc' : 'asc'})} />}
      {viewType==='board' && <BoardView database={database} records={filtered} onUpdate={updateRecord} />}
      {viewType==='gallery' && <GalleryView database={database} records={filtered} />}
      {viewType==='calendar' && <CalendarView database={database} records={filtered} />}
      {viewType==='list' && <ListView database={database} records={filtered} />}
      {viewType==='timeline' && <TimelineView database={database} records={filtered} />}

      <div className={cn("flex gap-2 p-2 border rounded-xl bg-muted/10", compact && "hidden sm:flex")}>
        {database.properties.slice(0,4).filter(p=> !hiddenCols.has(p.id)).map(p=> (
          <Input key={p.id} placeholder={p.name} value={newRow[p.id]||''} onChange={e=> setNewRow(s=> ({...s, [p.id]: e.target.value}))} className="h-8 text-sm flex-1"/>
        ))}
        <Button size="sm" onClick={handleAdd}>Add row</Button>
      </div>

      {showFilter && <FilterModal database={database} initial={filterGroup} onApply={g=> { setFilterGroup(g); setShowFilter(false)}} onClose={()=> setShowFilter(false)} />}
      {showSort && <SortModal database={database} current={sort} onApply={s=> { setSort(s); setShowSort(false)}} onClose={()=> setShowSort(false)} />}
    </div>
  )
}

function FilterModal({ database, initial, onApply, onClose }: { database: Database, initial?: FilterGroup, onApply:(g?:FilterGroup)=>void, onClose:()=>void }) {
  const [op, setOp] = useState<'and'|'or'|'not'>(initial?.op as any || 'and')
  const [conds, setConds] = useState<FilterCondition[]>(()=> (initial?.conditions as FilterCondition[] || []))
  const add = () => setConds([...conds, { propertyId: database.properties[0].id, operator: 'equals', value: '' }])
  return (
    <Modal open onClose={onClose} title="Filters" className="max-w-[560px]">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Match</span>
          <select value={op} onChange={e=> setOp(e.target.value as any)} className="border rounded-lg px-2 py-1 text-xs bg-background"><option value="and">AND</option><option value="or">OR</option><option value="not">NOT</option></select>
          <span className="text-xs text-muted-foreground">of the following</span>
          <button onClick={add} className="ml-auto text-xs border rounded-lg px-2 py-1 hover:bg-accent">+ Add condition</button>
        </div>
        {conds.length===0 && <div className="py-6 text-center text-xs text-muted-foreground border rounded-xl border-dashed">No filters — all records shown. Add e.g. Status = In Progress AND Priority = High.</div>}
        {conds.map((c, idx)=> (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-xl border bg-muted/20">
            <select value={c.propertyId} onChange={e=> { const n=[...conds]; n[idx]={...c, propertyId:e.target.value}; setConds(n)}} className="border rounded-lg px-2 py-1 text-xs bg-background flex-1">
              {database.properties.map(p=> <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select>
            <select value={c.operator} onChange={e=> { const n=[...conds]; n[idx]={...c, operator:e.target.value as any}; setConds(n)}} className="border rounded-lg px-2 py-1 text-xs bg-background">
              <option value="equals">equals</option><option value="not_equals">not equals</option><option value="contains">contains</option><option value="not_contains">not contains</option><option value="gt">gt</option><option value="lt">lt</option><option value="is_empty">is empty</option><option value="is_not_empty">is not empty</option>
            </select>
            <Input value={String(c.value)} onChange={e=> { const n=[...conds]; n[idx]={...c, value:e.target.value}; setConds(n)}} placeholder="value" className="h-7 text-xs flex-1" />
            <button onClick={()=> setConds(conds.filter((_,i)=>i!==idx))} className="p-1 hover:bg-accent rounded">✕</button>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={()=> { onApply(undefined); }}>Clear</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={()=> onApply(conds.length? { op, conditions: conds }: undefined)}>Apply</Button>
        </div>
      </div>
    </Modal>
  )
}

function SortModal({ database, current, onApply, onClose }: { database: Database, current: any, onApply:(s:any)=>void, onClose:()=>void }) {
  const [prop, setProp] = useState(current?.propertyId || database.properties[0].id)
  const [dir, setDir] = useState(current?.direction || 'asc')
  return (
    <Modal open onClose={onClose} title="Sort" className="max-w-[400px]">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <select value={prop} onChange={e=> setProp(e.target.value)} className="border rounded-lg px-2 py-2 text-sm bg-background flex-1">
            {database.properties.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={dir} onChange={e=> setDir(e.target.value as any)} className="border rounded-lg px-2 py-2 text-sm bg-background">
            <option value="asc">Asc</option><option value="desc">Desc</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={()=> onApply(null)}>Clear</Button>
          <Button size="sm" onClick={()=> onApply({ propertyId: prop, direction: dir })}>Apply</Button>
        </div>
      </div>
    </Modal>
  )
}

function TableView({ database, records, hiddenCols, onUpdate, onDelete, onSort }: { database: Database, records: DatabaseRecord[], hiddenCols:Set<string>, onUpdate:(id:string, props:any)=>void, onDelete:(id:string)=>void, onSort:(pid:string)=>void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const visibleProps = database.properties.filter(p=> p.visible!==false && !hiddenCols.has(p.id))
  return (
    <div className="border rounded-2xl overflow-hidden bg-card w-full max-w-full">
      <div className="w-full max-w-full overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[560px] md:min-w-0">
          <colgroup>
            <col style={{ width: '44px' }} />
            {visibleProps.map(p=> <col key={p.id} style={{ width: `${Math.max(14, 86 / Math.max(1, visibleProps.length))}%` }} />)}
            <col style={{ width: '40px' }} />
          </colgroup>
          <thead className="bg-muted/40 border-b text-xs">
            <tr>
              <th className="text-left px-2 py-2.5 font-medium w-10">#</th>
              {visibleProps.map(p=> (
                <th key={p.id} className="text-left px-2 py-2.5 font-medium cursor-pointer hover:bg-muted max-w-[220px]" onClick={()=> onSort(p.id)}>
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="truncate min-w-0 flex-1">{p.name}</span>
                    <span className="text-[10px] border rounded px-1 shrink-0 hidden sm:inline">{p.type}</span>
                    <ArrowUpDown size={10} className="shrink-0 opacity-60" />
                  </span>
                </th>
              ))}
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, idx)=> (
              <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40 group">
                <td className="px-2 py-2 text-muted-foreground text-xs">{idx+1}</td>
                {visibleProps.map(p=> (
                  <td key={p.id} className="px-2 py-2 align-middle max-w-[200px]" onDoubleClick={()=> setEditing(r.id+'-'+p.id)}>
                    {editing===r.id+'-'+p.id ? (
                      <input autoFocus defaultValue={String(r.properties[p.id]??'')} onBlur={e=> { onUpdate(r.id, { [p.id]: e.target.value }); setEditing(null)}} onKeyDown={e=> e.key==='Enter' && (e.target as HTMLInputElement).blur()} className="w-full min-w-0 bg-background border rounded-lg px-2 py-1 text-sm"/>
                    ) : (
                      <span className="block w-full min-w-0 break-words whitespace-normal line-clamp-3 text-[13px] leading-5">
                        {p.type==='status' ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium max-w-full truncate ${colorFor(String(r.properties[p.id]))}`}>{String(r.properties[p.id]||'')}</span> :
                         p.type==='select' ? <Badge>{String(r.properties[p.id]||'')}</Badge> :
                         p.type==='checkbox' ? <input type="checkbox" checked={!!r.properties[p.id]} onChange={e=> onUpdate(r.id, {[p.id]: e.target.checked})} /> :
                         p.type==='date' ? <span className="text-xs whitespace-nowrap">{String(r.properties[p.id]??'').slice(0,16)}</span> :
                         <span className="break-words">{String(r.properties[p.id]??'')}</span>}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-1"><button onClick={()=> onDelete(r.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded"><MoreHorizontal size={14}/></button></td>
              </tr>
            ))}
            {records.length===0 && <tr><td colSpan={visibleProps.length+2} className="text-center py-12 text-muted-foreground">No records. Add your first row below or clear filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BoardView({ database, records, onUpdate }: { database: Database, records: DatabaseRecord[], onUpdate:(id:string, props:any)=>void }) {
  const groupBy = database.views.find(v=>v.type==='board')?.groupBy || database.properties.find(p=> p.type==='status' || p.type==='select')?.id
  const groups = groupRecords(records, groupBy)
  return (
    <div className="flex gap-4 overflow-auto pb-2">
      {Object.entries(groups).map(([key, items])=> (
        <div key={key} className="w-[300px] shrink-0 rounded-2xl border bg-card p-3">
          <div className="flex items-center justify-between mb-3">
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colorFor(key)}`}>{key}</span>
            <span className="text-xs bg-muted px-2 py-1 rounded-full">{items.length}</span>
          </div>
          <div className="space-y-2">
            {items.map(r=> (
              <div key={r.id} draggable onDragEnd={e=> {
                // naive drop handling via prompt
              }} className="rounded-xl border bg-background p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab">
                <div className="font-medium text-sm line-clamp-2">{String(r.properties[database.properties[0].id]||'Untitled')}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {database.properties.slice(1,3).map(p=> (
                    <span key={p.id} className="text-xs bg-muted px-1.5 py-1 rounded-lg">{String(r.properties[p.id]||'—')}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <img src={`https://i.pravatar.cc/100?img=${(r.id.charCodeAt(0)%70)+1}`} className="w-6 h-6 rounded-full" alt=""/>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(r.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-3 py-2 rounded-xl border border-dashed text-xs hover:bg-accent">+ Add card</button>
        </div>
      ))}
    </div>
  )
}

function GalleryView({ database, records }: { database: Database, records: DatabaseRecord[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {records.map(r=> (
        <div key={r.id} className="rounded-2xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
          <div className="h-32 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 grid place-items-center text-2xl">▦</div>
          <div className="p-3">
            <div className="font-medium text-sm">{String(r.properties[database.properties[0].id]||'Untitled')}</div>
            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{Object.values(r.properties).slice(1,3).join(' • ')}</div>
          </div>
        </div>
      ))}
      {records.length===0 && <div className="col-span-full py-12 text-center text-muted-foreground border rounded-2xl border-dashed">No cards</div>}
    </div>
  )
}

function CalendarView({ database, records }: { database: Database, records: DatabaseRecord[] }) {
  const dateProp = database.properties.find(p=> p.type==='date')?.id
  const days = Array.from({length: 30}, (_,i)=> {
    const d = new Date(); d.setDate(d.getDate() -15 + i)
    return d
  })
  return (
    <div className="border rounded-2xl overflow-hidden bg-card p-3">
      <div className="grid grid-cols-7 gap-2 text-xs">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=> <div key={d} className="text-muted-foreground font-medium p-2">{d}</div>)}
        {days.map(d=> {
          const dayRecords = dateProp ? records.filter(r=> String(r.properties[dateProp]).slice(0,10)===d.toISOString().slice(0,10)) : []
          const isToday = d.toDateString()===new Date().toDateString()
          return (
            <div key={d.toISOString()} className={`min-h-[90px] rounded-xl border p-2 ${isToday ? 'bg-violet-500/10 border-violet-500/30' : 'bg-muted/20'}`}>
              <div className={`text-xs font-medium w-6 h-6 grid place-items-center rounded-full ${isToday ? 'bg-violet-500 text-white' : ''}`}>{d.getDate()}</div>
              <div className="space-y-1 mt-1">
                {dayRecords.slice(0,2).map(r=> (
                  <div key={r.id} className="text-[11px] bg-background border rounded-lg px-1.5 py-1 truncate">{String(r.properties[database.properties[0].id])}</div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ListView({ database, records }: { database: Database, records: DatabaseRecord[] }) {
  return (
    <div className="border rounded-2xl bg-card divide-y">
      {records.map(r=> (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
          <span className="w-2 h-2 rounded-full bg-violet-500"/>
          <span className="font-medium text-sm flex-1 truncate">{String(r.properties[database.properties[0].id]||'Untitled')}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">{Object.values(r.properties).slice(1,3).join(' • ')}</span>
        </div>
      ))}
    </div>
  )
}

function TimelineView({ database, records }: { database: Database, records: DatabaseRecord[] }) {
  const dateProp = database.properties.find(p=> p.type==='date' || p.type==='created_time' || p.type==='updated_time')?.id || database.properties[0].id
  const sorted = [...records].sort((a,b)=> {
    const da = new Date(String(a.properties[dateProp] || a.createdAt)).getTime()
    const db = new Date(String(b.properties[dateProp] || b.createdAt)).getTime()
    return da - db
  })
  if (sorted.length===0) return <div className="py-12 text-center text-muted-foreground border rounded-2xl border-dashed">No timeline data — add a date property and records.</div>
  return (
    <div className="border rounded-2xl bg-card p-4 overflow-auto">
      <div className="relative">
        <div className="absolute left-0 right-0 top-6 h-px bg-border" />
        <div className="flex gap-6 min-w-max">
          {sorted.map(r=> {
            const d = new Date(String(r.properties[dateProp] || r.createdAt))
            return (
              <div key={r.id} className="w-[200px] shrink-0 text-center">
                <div className="w-3 h-3 rounded-full bg-violet-500 border-2 border-white mx-auto relative z-10 shadow" />
                <div className="text-xs text-muted-foreground mt-2">{isNaN(d.getTime()) ? String(r.properties[dateProp]).slice(0,10) : d.toLocaleDateString()}</div>
                <div className="mt-2 p-3 rounded-xl border bg-background text-left">
                  <div className="font-medium text-sm line-clamp-2">{String(r.properties[database.properties[0].id]||'Untitled')}</div>
                  <div className="text-xs text-muted-foreground mt-1">{String(Object.values(r.properties)[1]||'')}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function colorFor(v: string) {
  if (['Done','Completed','High','Urgent','Active'].includes(v)) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
  if (['In Progress','Doing','Medium','Planning'].includes(v)) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20'
  if (['Todo','Low','Paused'].includes(v)) return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/20'
  if (['Review'].includes(v)) return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/20'
  return 'bg-muted text-muted-foreground'
}

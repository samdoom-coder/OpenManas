// Interactive knowledge graph — pages/databases/records as nodes,
// parent-child / embed / mention / relation / containment as edges.
// Zero-dependency SVG with a small deterministic force layout, pan/zoom,
// type filters, neighbor highlight, and click-to-open navigation.

export interface GraphNode { id: string, label: string, type: 'page' | 'database' | 'record' | 'person', x?: number, y?: number }
export interface GraphEdge { source: string, target: string, type: 'parent-child' | 'link' | 'mention' | 'relation' | 'contains' }

const MAX_PAGES = 60
const MAX_RECORDS = 60
const MAX_NODES = 150

export function buildGraph(
  pages: any[],
  databases: any[],
  blocks: any[] = [],
  records: any[] = [],
): { nodes: GraphNode[], edges: GraphEdge[], truncated: number } {
  const livePages = pages.filter((p) => !p.isTrashed)
  const pageNodes: GraphNode[] = livePages.slice(0, MAX_PAGES).map((p) => ({ id: p.id, label: p.title || 'Untitled', type: 'page' as const }))
  const dbNodes: GraphNode[] = databases.map((d) => ({ id: d.id, label: d.name || 'Database', type: 'database' as const }))
  const recNodes: GraphNode[] = records.slice(0, MAX_RECORDS).map((r) => {
    const vals = Object.values((r.properties ?? {}) as Record<string, unknown>)
    return { id: r.id, label: String(vals[0] ?? 'Record').slice(0, 30), type: 'record' as const }
  })
  let nodes = [...pageNodes, ...dbNodes, ...recNodes]
  const truncated = Math.max(0, livePages.length - MAX_PAGES) + Math.max(0, records.length - MAX_RECORDS)
  if (nodes.length > MAX_NODES) nodes = nodes.slice(0, MAX_NODES)
  const ids = new Set(nodes.map((n) => n.id))

  const edges: GraphEdge[] = []
  const push = (source: string, target: string, type: GraphEdge['type']) => {
    if (source && target && source !== target && ids.has(source) && ids.has(target)) {
      edges.push({ source, target, type })
    }
  }
  livePages.forEach((p) => {
    if (p.parentId) push(p.parentId, p.id, 'parent-child')
  })
  databases.forEach((d) => {
    if (d.pageId) push(d.pageId, d.id, 'contains')
  })
  records.slice(0, MAX_RECORDS).forEach((r) => {
    if (r.databaseId) push(r.databaseId, r.id, 'contains')
    if (r.pageId) push(r.id, r.pageId, 'link')
  })
  blocks.forEach((b) => {
    if (!b.pageId || !ids.has(b.pageId)) return
    if ((b.type === 'page_embed' || b.type === 'mention') && typeof b.content === 'string') {
      push(b.pageId, b.content, b.type === 'page_embed' ? 'link' : 'mention')
    } else if ((b.type === 'database_embed' || b.type === 'relation') && typeof b.content === 'string') {
      push(b.pageId, b.content, 'relation')
    }
  })
  // dedupe
  const seen = new Set<string>()
  const deduped = edges.filter((e) => {
    const k = `${e.source}>${e.target}:${e.type}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { nodes, edges: deduped, truncated }
}

// --- deterministic force layout (circle init + repulsion/springs/gravity) ---
export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  ticks = 140,
): Map<string, { x: number, y: number }> {
  const pos = new Map<string, { x: number, y: number }>()
  const n = nodes.length
  nodes.forEach((nd, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, n)
    const r = 240 + (i % 3) * 60
    pos.set(nd.id, { x: Math.cos(a) * r, y: Math.sin(a) * r })
  })
  const adj = new Map<string, string[]>()
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, [])
    if (!adj.has(e.target)) adj.set(e.target, [])
    adj.get(e.source)!.push(e.target)
    adj.get(e.target)!.push(e.source)
  })
  const repulse = 9000
  const springLen = 130
  const springK = 0.02
  for (let t = 0; t < ticks; t++) {
    const cool = 1 - t / ticks
    const arr = nodes.map((nd) => pos.get(nd.id)!)
    for (let i = 0; i < arr.length; i++) {
      let fx = -arr[i].x * 0.01
      let fy = -arr[i].y * 0.01
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue
        const dx = arr[i].x - arr[j].x
        const dy = arr[i].y - arr[j].y
        const d2 = dx * dx + dy * dy + 40
        const f = repulse / d2
        const d = Math.sqrt(d2)
        fx += (dx / d) * f
        fy += (dy / d) * f
      }
      const id = nodes[i].id
      for (const nb of adj.get(id) ?? []) {
        const p2 = pos.get(nb)
        if (!p2) continue
        const dx = p2.x - arr[i].x
        const dy = p2.y - arr[i].y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        fx += dx * springK * ((d - springLen) / d) * d * 0.05
        fy += dy * springK * ((d - springLen) / d) * d * 0.05
      }
      arr[i].x += Math.max(-20, Math.min(20, fx)) * cool
      arr[i].y += Math.max(-20, Math.min(20, fy)) * cool
    }
  }
  return pos
}

const TYPE_STYLE: Record<GraphNode['type'], { fill: string, r: number }> = {
  page: { fill: '#8b5cf6', r: 15 },
  database: { fill: '#10b981', r: 17 },
  record: { fill: '#f59e0b', r: 10 },
  person: { fill: '#f43f5e', r: 12 },
}

const EDGE_STYLE: Record<GraphEdge['type'], { stroke: string, dash?: string }> = {
  'parent-child': { stroke: '#94a3b8' },
  link: { stroke: '#8b5cf6', dash: '5 4' },
  mention: { stroke: '#f59e0b', dash: '2 3' },
  relation: { stroke: '#f43f5e', dash: '6 3' },
  contains: { stroke: '#10b981' },
}

import { useMemo, useRef, useState } from 'react'

export function KnowledgeGraphView({
  nodes, edges, truncated = 0, onSelectNode,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated?: number
  onSelectNode?: (node: GraphNode) => void
}) {
  const [hidden, setHidden] = useState<Set<GraphNode['type']>>(new Set())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState({ x: -500, y: -380, w: 1000 })
  const [drag, setDrag] = useState<{ kind: 'pan' | 'node', id?: string, sx: number, sy: number, vx: number, vy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const visible = useMemo(() => nodes.filter((n) => !hidden.has(n.type)), [nodes, hidden])
  const vIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible])
  const vEdges = useMemo(() => edges.filter((e) => vIds.has(e.source) && vIds.has(e.target)), [edges, vIds])

  const pos = useMemo(() => layoutGraph(visible, vEdges), [visible, vEdges])

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>()
    vEdges.forEach((e) => {
      if (!m.has(e.source)) m.set(e.source, new Set())
      if (!m.has(e.target)) m.set(e.target, new Set())
      m.get(e.source)!.add(e.target)
      m.get(e.target)!.add(e.source)
    })
    return m
  }, [vEdges])

  const matchIds = useMemo(() => {
    if (!query.trim()) return null
    const q = query.toLowerCase()
    return new Set(visible.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id))
  }, [visible, query])

  const selected = selectedId ? visible.find((n) => n.id === selectedId) ?? null : null
  const selectedNeighbors = selectedId ? neighbors.get(selectedId) ?? new Set<string>() : null

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const s = view.w / rect.width
    return { x: view.x + (clientX - rect.left) * s, y: view.y + (clientY - rect.top) * s }
  }

  const aspect = (() => {
    if (typeof window === 'undefined') return 16 / 9
    return Math.max(1, Math.min(2.2, window.innerWidth / 700))
  })()
  const h = view.w / aspect

  const toggleType = (t: GraphNode['type']) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
    setSelectedId(null)
  }

  const dimmed = (id: string) => {
    if (matchIds) return !matchIds.has(id)
    if (selectedNeighbors) return id !== selectedId && !selectedNeighbors.has(id)
    return false
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
        No pages or databases yet — create some to see the knowledge graph.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-card p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold mr-auto">
          Knowledge Graph — {visible.length} nodes • {vEdges.length} edges
          {truncated > 0 && <span className="text-muted-foreground font-normal"> (+{truncated} not shown)</span>}
        </div>
        {(['page', 'database', 'record'] as const).map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            aria-pressed={!hidden.has(t)}
            className={`px-2.5 py-1 rounded-full border text-xs capitalize ${hidden.has(t) ? 'opacity-40' : ''}`}
          >
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: TYPE_STYLE[t].fill }} />
            {t}s
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Highlight…"
          className="h-8 px-3 rounded-full border bg-background text-xs w-32"
        />
        <div className="flex items-center gap-1">
          <button onClick={() => setView((v) => ({ ...v, w: Math.max(300, v.w * 0.8) }))} className="w-8 h-8 rounded-lg border text-sm" aria-label="Zoom in">+</button>
          <button onClick={() => setView((v) => ({ ...v, w: Math.min(2400, v.w * 1.25) }))} className="w-8 h-8 rounded-lg border text-sm" aria-label="Zoom out">−</button>
          <button onClick={() => { setView({ x: -500, y: -380, w: 1000 }); setSelectedId(null) }} className="h-8 px-2.5 rounded-lg border text-xs">Reset</button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${h}`}
          className="flex-1 h-[420px] md:h-[560px] rounded-xl bg-muted/20 border cursor-grab touch-none select-none"
          onPointerDown={(e) => {
            (e.target as Element).closest('g[data-node]') ||
              setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y })
          }}
          onPointerMove={(e) => {
            if (!drag || !svgRef.current) return
            const rect = svgRef.current.getBoundingClientRect()
            const s = view.w / rect.width
            if (drag.kind === 'pan') {
              setView((v) => ({ ...v, x: drag.vx - (e.clientX - drag.sx) * s, y: drag.vy - (e.clientY - drag.sy) * s }))
            } else if (drag.id) {
              const wpt = toWorld(e.clientX, e.clientY)
              pos.set(drag.id, { x: wpt.x - drag.vx, y: wpt.y - drag.vy })
              // force re-render (pos is a mutated memo)
              setView((v) => ({ ...v }))
            }
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => { if (drag?.kind === 'pan') setDrag(null) }}
        >
          {vEdges.map((e, i) => {
            const a = pos.get(e.source)
            const b = pos.get(e.target)
            if (!a || !b) return null
            const st = EDGE_STYLE[e.type]
            const faint = selectedNeighbors && !(e.source === selectedId || e.target === selectedId)
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={st.stroke} strokeWidth={e.type === 'parent-child' ? 1.5 : 1.2}
                strokeDasharray={st.dash} opacity={faint ? 0.12 : 0.55}
              />
            )
          })}
          {visible.map((n) => {
            const p = pos.get(n.id)
            if (!p) return null
            const st = TYPE_STYLE[n.type]
            const isSel = n.id === selectedId
            const faint = dimmed(n.id)
            const showLabel = n.type !== 'record' || isSel || (selectedNeighbors?.has(n.id) ?? false) || (neighbors.get(n.id)?.size ?? 0) > 1
            return (
              <g
                key={n.id}
                data-node={n.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={faint ? 0.22 : 1}
                className="cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const wpt = toWorld(e.clientX, e.clientY)
                  setDrag({ kind: 'node', id: n.id, sx: e.clientX, sy: e.clientY, vx: wpt.x - p.x, vy: wpt.y - p.y })
                }}
                onPointerUp={(e) => {
                  if (drag?.kind === 'node' && drag.id === n.id) {
                    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy)
                    if (moved < 5) setSelectedId(n.id)
                  }
                  setDrag(null)
                }}
              >
                <title>{n.label} ({n.type})</title>
                {isSel && <circle r={st.r + 7} fill="none" stroke={st.fill} strokeWidth={2} opacity={0.7} />}
                <circle r={st.r} fill={st.fill} opacity={0.9} stroke="var(--background)" strokeWidth={2} />
                <text y={4.5} textAnchor="middle" fontSize={n.type === 'record' ? 9 : 11} fill="#fff" pointerEvents="none">
                  {n.type === 'page' ? '◈' : n.type === 'database' ? '▦' : '•'}
                </text>
                {showLabel && (
                  <text y={st.r + 14} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.85} pointerEvents="none">
                    {n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        <div className="lg:w-[260px] shrink-0 rounded-xl border bg-background p-4 text-sm space-y-3 self-start w-full">
          {!selected ? (
            <>
              <div className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">Legend</div>
              {(Object.keys(TYPE_STYLE) as GraphNode['type'][]).filter((t) => t !== 'person').map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs capitalize">
                  <span className="w-3 h-3 rounded-full" style={{ background: TYPE_STYLE[t].fill }} /> {t}s — {visible.filter((n) => n.type === t).length}
                </div>
              ))}
              <div className="pt-2 border-t space-y-1">
                {(Object.keys(EDGE_STYLE) as GraphEdge['type'][]).map((t) => (
                  <div key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-6 border-t-2" style={{ borderColor: EDGE_STYLE[t].stroke, borderTopStyle: EDGE_STYLE[t].dash ? 'dashed' : 'solid' }} />
                    {t} — {vEdges.filter((e) => e.type === t).length}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground pt-1">Click a node to inspect • drag to rearrange • drag background to pan.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: TYPE_STYLE[selected.type].fill }} />
                <span className="font-semibold truncate flex-1">{selected.label}</span>
                <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
              </div>
              <div className="text-xs text-muted-foreground capitalize">{selected.type} • {(neighbors.get(selected.id)?.size ?? 0)} connections</div>
              {onSelectNode && (
                <button
                  onClick={() => onSelectNode(selected)}
                  className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                >
                  Open {selected.type} →
                </button>
              )}
              <div className="pt-2 border-t space-y-1 max-h-[280px] overflow-auto">
                {[...(neighbors.get(selected.id) ?? [])].map((id) => {
                  const nb = visible.find((n) => n.id === id)
                  if (!nb) return null
                  return (
                    <button key={id} onClick={() => setSelectedId(id)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent text-xs flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_STYLE[nb.type].fill }} />
                      <span className="truncate">{nb.label}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

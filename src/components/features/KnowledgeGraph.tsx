// Knowledge graph stub — visualizes pages/databases as nodes, edges as links/relations
// Ready for future D3/force-graph integration. Keeps data model graph-ready.

export interface GraphNode { id: string, label: string, type: 'page'|'database'|'record'|'person', x?: number, y?: number }
export interface GraphEdge { source: string, target: string, type: 'parent-child'|'link'|'mention'|'relation' }

export function buildGraph(pages: any[], databases: any[]): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [
    ...pages.slice(0,12).map(p=> ({ id:p.id, label:p.title, type:'page' as const })),
    ...databases.map(d=> ({ id:d.id, label:d.name, type:'database' as const })),
  ]
  const edges: GraphEdge[] = []
  pages.forEach(p=> {
    if (p.parentId) edges.push({ source:p.parentId, target:p.id, type:'parent-child' })
  })
  // naive link edges from block mentions (placeholder)
  return { nodes, edges }
}

export function KnowledgeGraphView({ nodes, edges }: { nodes: GraphNode[], edges: GraphEdge[] }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="text-sm font-semibold">Knowledge Graph — {nodes.length} nodes • {edges.length} edges</div>
      <div className="text-xs text-muted-foreground mt-1">Interactive visualization coming soon. Data model is ready for vector + graph queries.</div>
      <div className="mt-4 h-[260px] rounded-xl bg-muted/30 border border-dashed grid place-items-center text-sm text-muted-foreground">
        Graph preview: {nodes.slice(0,5).map(n=> n.label).join(' — ')}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {nodes.slice(0,8).map(n=> (
          <span key={n.id} className="px-2 py-1 rounded-full border bg-background text-xs">{n.type}: {n.label.slice(0,18)}</span>
        ))}
      </div>
    </div>
  )
}

import type { Express } from 'express'
import { usingPg, pgQuery } from '../pg.js'
import { authStub, accessibleWorkspaceIds, requireWorkspaceAction } from '../helpers.js'
import { db } from '../state.js'

export function registerSearchRoutes(app: Express) {
  // Search — scoped to accessible workspaces (never cross-workspace). Optional
  // workspaceId narrows further (checked). Unused by the current client (local
  // Fuse search) but kept for API consumers.
  app.get('/api/search', authStub, async (req:any,res)=> {
    const q = (req.query.q as string||'').toLowerCase()
    if (!q) return res.json([])
    const userId = (req as any).userId as string
    const wsFilter = req.query.workspaceId as string | undefined
    if (wsFilter && !await requireWorkspaceAction(res, wsFilter, userId, 'view')) return
    const allowed = wsFilter ? new Set([wsFilter]) : await accessibleWorkspaceIds(userId)
    if (usingPg) {
      try {
        const like = `%${q}%`
        const ids = [...allowed]
        const pages = ids.length
          ? await pgQuery('SELECT id, title, updated_at FROM pages WHERE LOWER(title) LIKE $1 AND workspace_id = ANY($2) ORDER BY updated_at DESC LIMIT 5', [like, ids])
          : []
        const blocks = ids.length
          ? await pgQuery('SELECT b.id, b.content, b.updated_at FROM blocks b JOIN pages p ON p.id=b.page_id WHERE LOWER(b.content) LIKE $1 AND p.workspace_id = ANY($2) ORDER BY b.updated_at DESC LIMIT 5', [like, ids])
          : []
        return res.json([
          ...(pages as any[]).map(p=> ({ id: p.id, title: p.title, type:'page', breadcrumb:'', updatedAt: p.updated_at })),
          ...(blocks as any[]).map(b=> ({ id: b.id, title: String(b.content ?? '').slice(0,40), type:'block', snippet: String(b.content ?? '').slice(0,80), updatedAt: b.updated_at })),
        ])
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const pages = db.pages.filter(p=> allowed.has(String(p.workspaceId)) && p.title.toLowerCase().includes(q)).slice(0,5).map(p=> ({ id:p.id, title:p.title, type:'page', breadcrumb:'', updatedAt:p.updatedAt }))
    const pageWs = new Map(db.pages.map(p=> [p.id, String(p.workspaceId)]))
    const blocks = db.blocks.filter(b=> (pageWs.get(b.pageId) !== undefined && allowed.has(pageWs.get(b.pageId)!)) && b.content.toLowerCase().includes(q)).slice(0,5).map(b=> ({ id:b.id, title:b.content.slice(0,40), type:'block', snippet:b.content.slice(0,80), updatedAt:b.updatedAt }))
    res.json([...pages, ...blocks])
  })
}

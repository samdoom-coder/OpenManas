import type { Express } from 'express'
import { z } from 'zod'
import { usingPg, pgQuery, mapComment } from '../pg.js'
import { canDoPageAction } from '../acl.js'
import { authStub, accessibleWorkspaceIds, getWorkspaceRole, requireWorkspaceAction, uuidOrAbsent, workspaceIdForBlock, workspaceIdForPage, workspaceIdForRecord, MAX_COMMENT_CONTENT } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerCommentRoutes(app: Express) {
  // Comments — synced across users (slice 4). authorId is always the caller;
  // clients may pass `id` (UUID) for idempotent first-run uploads.
  // Reads need viewer+ in the owning workspace; unfiltered pulls are scoped to
  // accessible workspaces (never cross-workspace).
  app.get('/api/comments', authStub, async (req:any,res)=> {
    const pageId = req.query.pageId as string | undefined
    const blockId = req.query.blockId as string | undefined
    const recordId = req.query.recordId as string | undefined
    const userId = (req as any).userId as string
    const filterWsId = pageId
      ? await workspaceIdForPage(pageId)
      : blockId
        ? await workspaceIdForBlock(blockId)
        : recordId
          ? await workspaceIdForRecord(recordId)
          : null
    if ((pageId || blockId || recordId) && !filterWsId) return res.json([])
    if (filterWsId && !await requireWorkspaceAction(res, filterWsId, userId, 'view')) return
    if (usingPg) {
      try {
        if (filterWsId) {
          const conds: string[] = []
          const vals: any[] = []
          if (pageId) { vals.push(pageId); conds.push(`page_id=$${vals.length}`) }
          if (blockId) { vals.push(blockId); conds.push(`block_id=$${vals.length}`) }
          if (recordId) { vals.push(recordId); conds.push(`record_id=$${vals.length}`) }
          const rows = await pgQuery(`SELECT * FROM comments WHERE ${conds.join(' AND ')} ORDER BY created_at`, vals)
          return res.json(rows.map(mapComment))
        }
        const allowed = [...await accessibleWorkspaceIds(userId)]
        if (!allowed.length) return res.json([])
        const rows = await pgQuery(
          `SELECT c.* FROM comments c
           LEFT JOIN pages p ON p.id = c.page_id
           LEFT JOIN blocks b ON b.id = c.block_id
           LEFT JOIN pages bp ON bp.id = b.page_id
           LEFT JOIN database_records r ON r.id = c.record_id
           LEFT JOIN databases d ON d.id = r.database_id
           WHERE (c.page_id IS NULL AND c.block_id IS NULL AND c.record_id IS NULL)
              OR p.workspace_id = ANY($1) OR bp.workspace_id = ANY($1) OR d.workspace_id = ANY($1)
           ORDER BY c.created_at DESC LIMIT 200`, [allowed])
        return res.json(rows.map(mapComment))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    let c = db.comments
    if (pageId) c = c.filter(x=> x.pageId===pageId)
    if (blockId) c = c.filter(x=> x.blockId===blockId)
    if (recordId) c = c.filter(x=> x.recordId===recordId)
    if (!pageId && !blockId && !recordId) {
      const allowed = await accessibleWorkspaceIds(userId)
      const pageWs = new Map(db.pages.map((p: any)=> [p.id, String(p.workspaceId)]))
      const blockPage = new Map(db.blocks.map((b: any)=> [b.id, b.pageId]))
      const recDb = new Map(db.records.map((r: any)=> [r.id, r.databaseId]))
      const dbWs = new Map(db.databases.map((d: any)=> [d.id, String(d.workspaceId)]))
      const wsOf = (x: any): string | null => {
        if (x.pageId) return pageWs.get(x.pageId) ?? null
        if (x.blockId) { const pid = blockPage.get(x.blockId); return (pid && pageWs.get(pid)) ?? null }
        if (x.recordId) { const did = recDb.get(x.recordId); return (did && dbWs.get(did)) ?? null }
        return null
      }
      c = c.filter(x=> { const w = wsOf(x); return w === null || allowed.has(w) }).slice(-200)
    }
    res.json(c)
  })
  app.post('/api/comments', authStub, async (req:any,res)=> {
    const parsed = z.object({
      id: uuidOrAbsent,
      pageId: z.string().optional(),
      blockId: z.string().optional(),
      recordId: z.string().optional(),
      content: z.string().min(1).max(MAX_COMMENT_CONTENT),
      mentions: z.any().optional(),
      parentId: z.string().nullable().optional(),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const b = parsed.data as Record<string, any>
    // v1 ACL: commenting needs at least commenter rights in the owning workspace,
    // resolved via page → block → record (first link wins).
    const commentWsId = b.pageId
      ? await workspaceIdForPage(b.pageId)
      : b.blockId
        ? await workspaceIdForBlock(b.blockId)
        : b.recordId
          ? await workspaceIdForRecord(b.recordId)
          : null
    if ((b.pageId || b.blockId || b.recordId) && !commentWsId) {
      return res.status(404).json({ error: 'Target not found' })
    }
    if (commentWsId && !await requireWorkspaceAction(res, commentWsId, (req as any).userId, 'comment')) return
    if (usingPg) {
      try {
        const withId = !!b.id
        const rows = await pgQuery(
          withId
            ? 'INSERT INTO comments(id, page_id, block_id, record_id, author_id, content, mentions, parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING *'
            : 'INSERT INTO comments(page_id, block_id, record_id, author_id, content, mentions, parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          withId
            ? [b.id, b.pageId ?? null, b.blockId ?? null, b.recordId ?? null, (req as any).userId, b.content, b.mentions ? JSON.stringify(b.mentions) : null, b.parentId ?? null]
            : [b.pageId ?? null, b.blockId ?? null, b.recordId ?? null, (req as any).userId, b.content, b.mentions ? JSON.stringify(b.mentions) : null, b.parentId ?? null],
        )
        if (!rows[0] && withId) {
          const existing = await pgQuery('SELECT * FROM comments WHERE id=$1', [b.id])
          if (existing[0]) return res.status(200).json(mapComment(existing[0]))
        }
        return res.status(201).json(mapComment(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    if (b.id && db.comments.some(x=> x.id===b.id)) return res.status(200).json(db.comments.find(x=> x.id===b.id))
    const c = { id: b.id ?? uuid(), ...b, authorId: (req as any).userId, resolved: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.comments.push(c); saveDB()
    res.status(201).json(c)
  })
  app.patch('/api/comments/:id', authStub, async (req:any,res)=> {
    const parsed = z.object({
      content: z.string().min(1).max(MAX_COMMENT_CONTENT).optional(),
      resolved: z.boolean().optional(),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (parsed.data.content === undefined && parsed.data.resolved === undefined) {
      return res.status(400).json({ error: 'Nothing to update (content|resolved)' })
    }
    if (usingPg) {
      try {
        const cur = await pgQuery('SELECT * FROM comments WHERE id=$1', [req.params.id])
        if (!cur[0]) return res.status(404).json({ error:'Not found' })
        const isAuthor = (cur[0] as any).author_id === (req as any).userId
        if (!isAuthor) {
          // Non-authors need editor rights in the owning workspace (when known).
          const wsId = await workspaceIdForPage((cur[0] as any).page_id)
          if (wsId) {
            const { role } = await getWorkspaceRole(wsId, (req as any).userId)
            if (!role || !canDoPageAction(role, 'edit')) return res.status(403).json({ error: 'Only the author or an editor can update this comment' })
          } else if (parsed.data.content !== undefined) {
            return res.status(403).json({ error: 'Only the author can edit this comment' })
          }
        }
        const sets: string[] = []
        const vals: any[] = []
        if (parsed.data.content !== undefined) { vals.push(parsed.data.content); sets.push(`content=$${vals.length}`) }
        if (parsed.data.resolved !== undefined) { vals.push(parsed.data.resolved); sets.push(`resolved=$${vals.length}`) }
        vals.push(req.params.id)
        const rows = await pgQuery(`UPDATE comments SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
        return res.json(mapComment(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const c = db.comments.find(x=> x.id===req.params.id)
    if (!c) return res.status(404).json({ error:'Not found' })
    if (c.authorId !== (req as any).userId && parsed.data.content !== undefined) {
      return res.status(403).json({ error: 'Only the author can edit this comment' })
    }
    Object.assign(c, parsed.data, { updatedAt: new Date().toISOString() })
    saveDB()
    res.json(c)
  })
  app.delete('/api/comments/:id', authStub, async (req:any,res)=> {
    if (usingPg) {
      try {
        const cur = await pgQuery('SELECT author_id, page_id FROM comments WHERE id=$1', [req.params.id])
        if (!cur[0]) return res.status(404).json({ error:'Not found' })
        const isAuthor = (cur[0] as any).author_id === (req as any).userId
        if (!isAuthor) {
          const wsId = await workspaceIdForPage((cur[0] as any).page_id)
          if (wsId) {
            const { role } = await getWorkspaceRole(wsId, (req as any).userId)
            if (!role || !canDoPageAction(role, 'delete')) return res.status(403).json({ error: 'Only the author or an admin can delete this comment' })
          } else {
            return res.status(403).json({ error: 'Only the author can delete this comment' })
          }
        }
        await pgQuery('DELETE FROM comments WHERE id=$1', [req.params.id])
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const idx = db.comments.findIndex(x=> x.id===req.params.id)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    if (db.comments[idx].authorId && db.comments[idx].authorId !== (req as any).userId) {
      return res.status(403).json({ error: 'Only the author can delete this comment' })
    }
    db.comments.splice(idx,1); saveDB()
    res.json({ ok:true })
  })
}

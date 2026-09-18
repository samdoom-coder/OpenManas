import type { Express } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { usingPg, pgQuery } from '../pg.js'
import { authStub, requireWorkspaceAction, workspaceIdForPage } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerSharingRoutes(app: Express) {
  // Sharing — bearer invite links per page. Creating/revoking needs admin
  // (share); listing needs editor+ (tokens are bearer secrets).
  app.post('/api/pages/:id/shares', authStub, async (req:any,res)=> {
    const parsed = z.object({
      permission: z.enum(['view', 'comment', 'edit']).default('view'),
      visibility: z.enum(['private', 'workspace', 'public']).default('workspace'),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const shareWsId = await workspaceIdForPage(req.params.id)
    if (!shareWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, shareWsId, (req as any).userId, 'share')) return
    const token = crypto.randomBytes(24).toString('hex')
    if (usingPg) {
      try {
        const exists = await pgQuery('SELECT id FROM pages WHERE id=$1', [req.params.id])
        if (!exists[0]) return res.status(404).json({ error:'Not found' })
        const rows = await pgQuery(
          'INSERT INTO share_links(page_id, permission, visibility, token, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, page_id, permission, visibility, token, created_at',
          [req.params.id, parsed.data.permission, parsed.data.visibility, token, (req as any).userId],
        )
        const r: any = rows[0]
        return res.status(201).json({ id: r.id, pageId: r.page_id, permission: r.permission, visibility: r.visibility, token: r.token, createdAt: r.created_at })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const page = db.pages.find(p=> p.id===req.params.id)
    if (!page) return res.status(404).json({ error:'Not found' })
    const link = { id: uuid(), pageId: req.params.id, permission: parsed.data.permission, visibility: parsed.data.visibility, token, createdBy: (req as any).userId, createdAt: new Date().toISOString() }
    db.shares.push(link); saveDB()
    res.status(201).json(link)
  })
  app.get('/api/pages/:id/shares', authStub, async (req:any,res)=> {
    const listWsId = await workspaceIdForPage(req.params.id)
    if (!listWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, listWsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT id, page_id, permission, visibility, token, created_at FROM share_links WHERE page_id=$1 ORDER BY created_at DESC', [req.params.id])
        return res.json(rows.map((r: any) => ({ id: r.id, pageId: r.page_id, permission: r.permission, visibility: r.visibility, token: r.token, createdAt: r.created_at })))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    res.json(db.shares.filter(s=> s.pageId===req.params.id))
  })
  // Public: validate an invite token (no auth — the token IS the credential).
  app.get('/api/shares/:token', async (req,res)=> {
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT page_id, permission, visibility FROM share_links WHERE token=$1', [req.params.token])
        if (!rows[0]) return res.status(404).json({ error:'Invalid or revoked link' })
        const r: any = rows[0]
        return res.json({ pageId: r.page_id, permission: r.permission, visibility: r.visibility })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const link = db.shares.find(s=> s.token===req.params.token)
    if (!link) return res.status(404).json({ error:'Invalid or revoked link' })
    res.json({ pageId: link.pageId, permission: link.permission, visibility: link.visibility })
  })
  app.delete('/api/shares/:token', authStub, async (req:any,res)=> {
    if (usingPg) {
      try {
        const cur = await pgQuery('SELECT page_id FROM share_links WHERE token=$1', [req.params.token])
        if (!cur[0]) return res.status(404).json({ error:'Not found' })
        const revokeWsId = await workspaceIdForPage((cur[0] as any).page_id)
        if (revokeWsId && !await requireWorkspaceAction(res, revokeWsId, (req as any).userId, 'share')) return
        const out = await pgQuery('DELETE FROM share_links WHERE token=$1 RETURNING id', [req.params.token])
        if (!out[0]) return res.status(404).json({ error:'Not found' })
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const link = db.shares.find(s=> s.token===req.params.token)
    if (!link) return res.status(404).json({ error:'Not found' })
    const revokeWsId = await workspaceIdForPage(link.pageId)
    if (revokeWsId && !await requireWorkspaceAction(res, revokeWsId, (req as any).userId, 'share')) return
    const idx = db.shares.findIndex(s=> s.token===req.params.token)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    db.shares.splice(idx,1); saveDB()
    res.json({ ok:true })
  })
}

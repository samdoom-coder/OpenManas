import type { Express } from 'express'
import { usingPg, pgQuery, mapPage } from '../pg.js'
import { minimumRoleForPagePatch, type PageAction } from '../acl.js'
import { authStub, accessibleWorkspaceIds, pageSchema, requireWorkspaceAction, shareLinkForPage, workspaceIdForPage } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

/** Clamp a cover focal position to an int 0-100 (default 50). */
function clampCoverPos(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 50
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function registerPageRoutes(app: Express) {
  // Pages — reads need viewer+, writes editor+, sharing changes + deletes admin.
  // Unfiltered lists are scoped to accessible workspaces (never cross-workspace).
  app.get('/api/pages', authStub, async (req:any, res)=> {
    const workspaceId = req.query.workspaceId as string | undefined
    const userId = (req as any).userId as string
    if (workspaceId) {
      if (!await requireWorkspaceAction(res, workspaceId, userId, 'view')) return
      if (usingPg) {
        try {
          const rows = await pgQuery('SELECT * FROM pages WHERE workspace_id=$1 ORDER BY updated_at DESC', [workspaceId])
          return res.json(rows.map(mapPage))
        } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
      }
      return res.json(db.pages.filter(p=> p.workspaceId===workspaceId))
    }
    const allowed = await accessibleWorkspaceIds(userId)
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM pages ORDER BY updated_at DESC')
        return res.json(rows.map(mapPage).filter((p: any)=> allowed.has(String(p.workspaceId))))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    res.json(db.pages.filter((p: any)=> allowed.has(String(p.workspaceId))))
  })
  // Single page — members need viewer+; anyone holding a valid invite-link
  // token (?token=) may read without membership or a session. Writes still
  // require auth + membership.
  app.get('/api/pages/:id', authStub, async (req:any, res)=> {
    const token = req.query.token as string | undefined
    let viaToken = false
    if (token !== undefined) {
      const link = await shareLinkForPage(token, req.params.id)
      if (!link) return res.status(404).json({ error:'Invalid or revoked link' })
      viaToken = true
    }
    if (!viaToken) {
      const wsId = await workspaceIdForPage(req.params.id)
      if (!wsId) return res.status(404).json({ error:'Not found' })
      if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'view')) return
    }
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM pages WHERE id=$1', [req.params.id])
        if (!rows[0]) return res.status(404).json({ error:'Not found' })
        return res.json(mapPage(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const page = db.pages.find((p:any)=> String(p.id)===String(req.params.id))
    if (!page) return res.status(404).json({ error:'Not found' })
    res.json(page)
  })
  app.post('/api/pages', authStub, async (req:any, res)=> {
    const parsed = pageSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (!await requireWorkspaceAction(res, parsed.data.workspaceId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const d = parsed.data
        const withId = !!d.id
        const coverPos = clampCoverPos((d as any).coverPosition)
        const rows = await pgQuery(
          withId
            ? 'INSERT INTO pages(id, workspace_id, parent_id, title, icon, cover, cover_position, description, properties, theme) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *'
            : 'INSERT INTO pages(workspace_id, parent_id, title, icon, cover, cover_position, description, properties, theme) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          withId
            ? [d.id, d.workspaceId, d.parentId ?? null, d.title, (d as any).icon ?? null, (d as any).cover ?? null, coverPos, (d as any).description ?? null, JSON.stringify((d as any).properties ?? {}), (d as any).theme ?? 'default']
            : [d.workspaceId, d.parentId ?? null, d.title, (d as any).icon ?? null, (d as any).cover ?? null, coverPos, (d as any).description ?? null, JSON.stringify((d as any).properties ?? {}), (d as any).theme ?? 'default'],
        )
        const page = mapPage(rows[0])
        await pgQuery('INSERT INTO activities(workspace_id, user_id, action, target_id, target_type) VALUES ($1,$2,$3,$4,$5)', [page.workspaceId, (req as any).userId, 'page_created', page.id, 'page']).catch(()=>{})
        return res.status(201).json(page)
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const page = { ...parsed.data, id: parsed.data.id ?? uuid(), isFavorite:false, isArchived:false, isTrashed:false, isShared:false, createdBy: (req as any).userId, updatedBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.pages.push(page); saveDB()
    db.activities.unshift({ id: uuid(), workspaceId: page.workspaceId, userId: (req as any).userId, action:'page_created', targetId: page.id, targetType:'page', createdAt: new Date().toISOString() })
    res.status(201).json(page)
  })
  app.patch('/api/pages/:id', authStub, async (req:any, res)=> {
    const wsId = await workspaceIdForPage(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    // Sharing/visibility changes need admin (share), content edits need editor.
    const action: PageAction = minimumRoleForPagePatch(req.body as Record<string, unknown>) === 'admin' ? 'share' : 'edit'
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, action)) return
    if (usingPg) {
      try {
        const allowed = ['title','icon','cover','cover_position','description','properties','theme','is_favorite','is_archived','is_trashed','is_shared','share_mode','parent_id'] as const
        const sets: string[] = []
        const vals: any[] = []
        const body = req.body as Record<string, any>
        const rawCoverPos = body.coverPosition ?? body.cover_position
        if (rawCoverPos !== undefined && !Number.isFinite(Number(rawCoverPos))) {
          return res.status(400).json({ error: 'Invalid coverPosition — expected a number 0-100' })
        }
        // accept both camelCase (client) and snake_case
        const norm: Record<string, any> = {
          title: body.title, icon: body.icon, cover: body.cover, description: body.description, theme: body.theme,
          cover_position: rawCoverPos !== undefined ? clampCoverPos(rawCoverPos) : undefined,
          properties: body.properties !== undefined ? JSON.stringify(body.properties) : undefined,
          is_favorite: body.isFavorite ?? body.is_favorite, is_archived: body.isArchived ?? body.is_archived,
          is_trashed: body.isTrashed ?? body.is_trashed, is_shared: body.isShared ?? body.is_shared,
          share_mode: body.shareMode ?? body.share_mode, parent_id: body.parentId ?? body.parent_id,
        }
        for (const k of allowed) {
          if (norm[k] !== undefined) { sets.push(`${k}=$${vals.length + 1}`); vals.push(norm[k]) }
        }
        if (sets.length === 0) {
          const rows = await pgQuery('SELECT * FROM pages WHERE id=$1', [req.params.id])
          if (!rows[0]) return res.status(404).json({ error:'Not found' })
          return res.json(mapPage(rows[0]))
        }
        const params: any[] = [...vals]
        params.push((req as any).userId); const byIdx = params.length
        params.push(req.params.id); const idIdx = params.length
        const out = await pgQuery(`UPDATE pages SET ${sets.join(', ')}, updated_at=NOW(), updated_by=$${byIdx} WHERE id=$${idIdx} RETURNING *`, params)
        if (!out[0]) return res.status(404).json({ error:'Not found' })
        return res.json(mapPage(out[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const page = db.pages.find(p=> p.id===req.params.id)
    if (!page) return res.status(404).json({ error:'Not found' })
    const patch = { ...(req.body as Record<string, any>) }
    if (patch.coverPosition !== undefined || patch.cover_position !== undefined) {
      const raw = patch.coverPosition ?? patch.cover_position
      if (!Number.isFinite(Number(raw))) return res.status(400).json({ error: 'Invalid coverPosition — expected a number 0-100' })
      patch.coverPosition = clampCoverPos(raw)
      delete patch.cover_position
    }
    Object.assign(page, patch, { updatedAt: new Date().toISOString(), updatedBy: (req as any).userId })
    saveDB()
    res.json(page)
  })
  // Permanent delete (Trash → Delete forever, Empty trash, record-page
  // cleanup). This is a HARD delete: blocks/comments/shares/versions go with
  // the page (ON DELETE CASCADE on Postgres, mirrored on the JSON backend).
  // Moving to trash is PATCH { isTrashed: true } — never this endpoint.
  app.delete('/api/pages/:id', authStub, async (req:any, res)=> {
    const wsId = await workspaceIdForPage(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'delete')) return
    if (usingPg) {
      try {
        const out = await pgQuery('DELETE FROM pages WHERE id=$1 RETURNING id', [req.params.id])
        if (!out[0]) return res.status(404).json({ error:'Not found' })
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const idx = db.pages.findIndex(p=> p.id===req.params.id)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    const pageId = req.params.id as string
    const blockIds = new Set(db.blocks.filter(b=> b.pageId===pageId).map(b=> b.id))
    db.pages.splice(idx,1)
    db.blocks = db.blocks.filter(b=> b.pageId!==pageId)
    // mirror Postgres: child pages become top-level, record links are nulled
    for (const p of db.pages) if (p.parentId===pageId) p.parentId = null
    for (const r of db.records) if (r.pageId===pageId) r.pageId = undefined
    db.comments = db.comments.filter(c=> c.pageId!==pageId && !blockIds.has(c.blockId))
    db.shares = (db.shares ?? []).filter(s=> s.pageId!==pageId)
    db.versions = (db.versions ?? []).filter((v:any)=> v.pageId!==pageId)
    saveDB()
    res.json({ ok:true })
  })
  app.post('/api/pages/:id/duplicate', authStub, async (req:any, res)=> {
    const wsId = await workspaceIdForPage(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const orig = await pgQuery('SELECT * FROM pages WHERE id=$1', [req.params.id])
        if (!orig[0]) return res.status(404).json({ error:'Not found' })
        const copy = await pgQuery('INSERT INTO pages(workspace_id, parent_id, title, icon, cover, description, properties, theme, is_favorite, is_archived, is_trashed, is_shared, share_mode, created_by, updated_by) SELECT workspace_id, parent_id, title || \' (copy)\', icon, cover, description, properties, theme, false, false, false, false, share_mode, $2, $2 FROM pages WHERE id=$1 RETURNING *', [req.params.id, (req as any).userId])
        await pgQuery('INSERT INTO blocks(page_id, parent_id, type, content, properties, position) SELECT $1, parent_id, type, content, properties, position FROM blocks WHERE page_id=$2 ORDER BY position', [copy[0].id, req.params.id])
        return res.json(mapPage(copy[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const orig = db.pages.find(p=> p.id===req.params.id)
    if (!orig) return res.status(404).json({ error:'Not found' })
    const copy = { ...orig, id: uuid(), title: orig.title+' (copy)', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.pages.push(copy)
    const blocks = db.blocks.filter(b=> b.pageId===orig.id)
    blocks.forEach(b=> db.blocks.push({ ...b, id: uuid(), pageId: copy.id }))
    saveDB()
    res.json(copy)
  })
}

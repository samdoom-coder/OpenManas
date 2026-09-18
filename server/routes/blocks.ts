import type { Express } from 'express'
import { usingPg, pgQuery, mapBlock } from '../pg.js'
import { authStub, blockSchema, requireWorkspaceAction, shareLinkForPage, workspaceIdForBlock, workspaceIdForPage, MAX_BLOCK_CONTENT } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerBlockRoutes(app: Express) {
  // Blocks — reads need viewer+, all writes need editor+ in the owning workspace.
  // A valid invite-link token (?token=) grants reads without membership.
  app.get('/api/pages/:id/blocks', authStub, async (req:any,res)=> {
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
      try { return res.json((await pgQuery('SELECT * FROM blocks WHERE page_id=$1 ORDER BY position, id', [req.params.id])).map(mapBlock)) } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const blocks = db.blocks.filter(b=> b.pageId===req.params.id).sort((a,b)=> a.position-b.position)
    res.json(blocks)
  })
  app.post('/api/blocks', authStub, async (req:any,res)=> {
    const parsed = blockSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const wsId = await workspaceIdForPage(parsed.data.pageId)
    if (!wsId) return res.status(404).json({ error: 'Page not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const withId = !!parsed.data.id
        const rows = await pgQuery(
          withId
            ? 'INSERT INTO blocks(id, page_id, parent_id, type, content, properties, position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *'
            : 'INSERT INTO blocks(page_id, parent_id, type, content, properties, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          withId
            ? [parsed.data.id, parsed.data.pageId, parsed.data.parentId ?? null, parsed.data.type, parsed.data.content, JSON.stringify(parsed.data.properties ?? {}), parsed.data.position]
            : [parsed.data.pageId, parsed.data.parentId ?? null, parsed.data.type, parsed.data.content, JSON.stringify(parsed.data.properties ?? {}), parsed.data.position])
        return res.status(201).json(mapBlock(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const block = { ...parsed.data, id: parsed.data.id ?? uuid(), properties: parsed.data.properties||{}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.blocks.push(block); saveDB()
    res.status(201).json(block)
  })
  app.patch('/api/blocks/:id', authStub, async (req:any,res)=> {
    if (typeof (req.body as any)?.content === 'string' && (req.body as any).content.length > MAX_BLOCK_CONTENT) {
      return res.status(400).json({ error: `content too large (max ${MAX_BLOCK_CONTENT} chars)` })
    }
    const wsId = await workspaceIdForBlock(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const b = req.body as Record<string, any>
        const sets: string[] = []
        const vals: any[] = []
        if (b.content !== undefined) { vals.push(b.content); sets.push(`content=$${vals.length}`) }
        if (b.type !== undefined) { vals.push(b.type); sets.push(`type=$${vals.length}`) }
        if (b.position !== undefined) { vals.push(b.position); sets.push(`position=$${vals.length}`) }
        if (b.parentId !== undefined || b.parent_id !== undefined) { vals.push(b.parentId ?? b.parent_id); sets.push(`parent_id=$${vals.length}`) }
        if (b.properties !== undefined) { vals.push(JSON.stringify(b.properties)); sets.push(`properties=$${vals.length}`) }
        if (sets.length === 0) {
          const rows = await pgQuery('SELECT * FROM blocks WHERE id=$1', [req.params.id])
          if (!rows[0]) return res.status(404).json({ error:'Not found' })
          return res.json(mapBlock(rows[0]))
        }
        vals.push(req.params.id)
        const rows = await pgQuery(`UPDATE blocks SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
        if (!rows[0]) return res.status(404).json({ error:'Not found' })
        return res.json(mapBlock(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const b = db.blocks.find(x=> x.id===req.params.id)
    if (!b) return res.status(404).json({ error:'Not found' })
    Object.assign(b, req.body, { updatedAt: new Date().toISOString() })
    saveDB()
    res.json(b)
  })
  app.delete('/api/blocks/:id', authStub, async (req:any,res)=> {
    const wsId = await workspaceIdForBlock(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const out = await pgQuery('DELETE FROM blocks WHERE id=$1 RETURNING id', [req.params.id])
        if (!out[0]) return res.status(404).json({ error:'Not found' })
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const idx = db.blocks.findIndex(x=> x.id===req.params.id)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    db.blocks.splice(idx,1); saveDB()
    res.json({ ok:true })
  })
  app.post('/api/blocks/reorder', authStub, async (req:any,res)=> {
    const { pageId, orderedIds } = req.body as { pageId:string, orderedIds:string[] }
    const wsId = await workspaceIdForPage(pageId)
    if (!wsId) return res.status(404).json({ error: 'Page not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        for (let i = 0; i < orderedIds.length; i++) {
          await pgQuery('UPDATE blocks SET position=$1, updated_at=NOW() WHERE id=$2 AND page_id=$3', [i, orderedIds[i], pageId])
        }
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    orderedIds.forEach((id, idx)=> {
      const b = db.blocks.find(x=> x.id===id && x.pageId===pageId)
      if (b) b.position = idx
    })
    saveDB()
    res.json({ ok:true })
  })
}

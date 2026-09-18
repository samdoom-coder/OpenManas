import type { Express } from 'express'
import { usingPg, pgQuery, mapVersion } from '../pg.js'
import { authStub, requireWorkspaceAction, versionBodySchema, workspaceIdForPage, MAX_VERSIONS_PER_PAGE_SERVER } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerVersionRoutes(app: Express) {
  // Page versions — snapshot history per page (server persistence for the
  // local-first `src/lib/versions.ts` store). Reads need viewer+ in the owning
  // workspace; creating/deleting needs editor+. Snapshots are append-only and
  // capped at 20/page (oldest drops) on both backends. Clients may pass `id`
  // (UUID) for idempotent first-run uploads; `version` is always server-assigned
  // (max+1) so concurrent writers can't collide.
  app.get('/api/pages/:id/versions', authStub, async (req:any,res)=> {
    const wsId = await workspaceIdForPage(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'view')) return
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM page_versions WHERE page_id=$1 ORDER BY version ASC', [req.params.id])
        return res.json(rows.map(mapVersion))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    res.json((db.versions ?? []).filter((v:any)=> v.pageId===req.params.id).sort((a:any,b:any)=> a.version-b.version))
  })
  app.post('/api/pages/:id/versions', authStub, async (req:any,res)=> {
    const parsed = versionBodySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const wsId = await workspaceIdForPage(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    const b = parsed.data as Record<string, any>
    if (usingPg) {
      try {
        if (b.id) {
          const existing = await pgQuery('SELECT * FROM page_versions WHERE id=$1', [b.id])
          if (existing[0]) return res.status(200).json(mapVersion(existing[0]))
        }
        const nxt = await pgQuery('SELECT COALESCE(MAX(version),0)+1 AS next FROM page_versions WHERE page_id=$1', [req.params.id])
        const nextVersion = Number((nxt[0] as any)?.next ?? 1)
        const rows = await pgQuery(
          b.id
            ? 'INSERT INTO page_versions(id, page_id, version, blocks_snapshot, message, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING *'
            : 'INSERT INTO page_versions(page_id, version, blocks_snapshot, message, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          b.id
            ? [b.id, req.params.id, nextVersion, JSON.stringify(b.blocksSnapshot ?? []), b.message ?? null, (req as any).userId]
            : [req.params.id, nextVersion, JSON.stringify(b.blocksSnapshot ?? []), b.message ?? null, (req as any).userId],
        )
        if (!rows[0] && b.id) {
          const existing = await pgQuery('SELECT * FROM page_versions WHERE id=$1', [b.id])
          if (existing[0]) return res.status(200).json(mapVersion(existing[0]))
        }
        // Enforce the per-page cap server-side (FIFO — oldest drops).
        await pgQuery(
          'DELETE FROM page_versions WHERE page_id=$1 AND id NOT IN (SELECT id FROM page_versions WHERE page_id=$1 ORDER BY version DESC LIMIT $2)',
          [req.params.id, MAX_VERSIONS_PER_PAGE_SERVER],
        ).catch(() => {})
        return res.status(201).json(mapVersion(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    if (b.id && (db.versions ?? []).some((v:any)=> v.id===b.id)) {
      return res.status(200).json(db.versions.find((v:any)=> v.id===b.id))
    }
    const existing = (db.versions ?? []).filter((v:any)=> v.pageId===req.params.id)
    const nextVersion = existing.reduce((m:number,v:any)=> Math.max(m, typeof v.version === 'number' ? v.version : 0), 0) + 1
    const v = { id: b.id ?? uuid(), pageId: req.params.id, version: nextVersion, blocksSnapshot: b.blocksSnapshot ?? [], message: b.message, createdBy: (req as any).userId, createdAt: new Date().toISOString() }
    db.versions = [...(db.versions ?? []), v].filter((x:any)=> true)
    // Cap: keep newest 20 for this page, drop oldest.
    const others = db.versions.filter((x:any)=> x.pageId!==req.params.id)
    const mine = db.versions.filter((x:any)=> x.pageId===req.params.id).sort((a:any,b2:any)=> a.version-b2.version).slice(-MAX_VERSIONS_PER_PAGE_SERVER)
    db.versions = [...others, ...mine]
    saveDB()
    res.status(201).json(v)
  })
  app.delete('/api/pages/:id/versions/:versionId', authStub, async (req:any,res)=> {
    const wsId = await workspaceIdForPage(req.params.id)
    if (!wsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const out = await pgQuery('DELETE FROM page_versions WHERE id=$1 AND page_id=$2 RETURNING id', [req.params.versionId, req.params.id])
        if (!out[0]) return res.status(404).json({ error:'Not found' })
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const idx = (db.versions ?? []).findIndex((v:any)=> v.id===req.params.versionId && v.pageId===req.params.id)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    db.versions.splice(idx,1); saveDB()
    res.json({ ok:true })
  })
}

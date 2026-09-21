import type { Express } from 'express'
import { z } from 'zod'
import { usingPg, pgQuery, mapRecord } from '../pg.js'
import { authStub, accessibleWorkspaceIds, isUuidLike, requireWorkspaceAction, uuidOrAbsent, workspaceIdForDatabase, workspaceIdForRecord } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerDatabaseRoutes(app: Express) {
  // Databases — reads need viewer+, schema writes editor+, deletes admin.
  // Unfiltered lists are scoped to accessible workspaces (never cross-workspace).
  app.get('/api/databases', authStub, async (req:any,res)=> {
    const ws = req.query.workspaceId as string | undefined
    const userId = (req as any).userId as string
    if (ws) {
      if (!await requireWorkspaceAction(res, ws, userId, 'view')) return
    }
    const allowed = ws ? null : await accessibleWorkspaceIds(userId)
    if (usingPg) {
      try {
        const rows = ws
          ? await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d WHERE workspace_id=$1 ORDER BY updated_at DESC', [ws])
          : await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d ORDER BY updated_at DESC')
        return res.json(rows.map((d: any) => ({
          id: d.id, workspaceId: d.workspace_id, pageId: d.page_id ?? undefined, name: d.name, icon: d.icon, description: d.description,
          isFavorite: d.is_favorite ?? false,
          properties: (d.props ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.type, options: p.options ?? undefined, relationDatabaseId: p.relation_database_id ?? undefined, width: p.width ?? undefined, visible: p.visible ?? true })),
          views: (d.views ?? []).map((v: any) => ({ id: v.id, name: v.name, type: v.type, filter: v.filter ?? undefined, sort: v.sort ?? undefined, groupBy: v.group_by ?? undefined, visibleProperties: v.visible_properties ?? undefined })),
          createdBy: d.created_by, createdAt: d.created_at, updatedAt: d.updated_at,
        })).filter((d: any)=> !allowed || allowed.has(String(d.workspaceId))))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const wsq = req.query.workspaceId as string
    let dbs = db.databases
    if (wsq) dbs = dbs.filter(d=> d.workspaceId===wsq)
    else if (allowed) dbs = dbs.filter((d: any)=> allowed.has(String(d.workspaceId)))
    res.json(dbs)
  })
  app.post('/api/databases', authStub, async (req:any,res)=> {
    const schema = z.object({ id: uuidOrAbsent, workspaceId: z.string(), name: z.string().min(1).max(100), icon: z.string().max(50).optional(), description: z.string().max(2000).optional(), properties: z.array(z.any()).optional(), views: z.array(z.any()).optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (!await requireWorkspaceAction(res, parsed.data.workspaceId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const withId = !!parsed.data.id
        const d = await pgQuery(
          withId
            ? 'INSERT INTO databases(id, workspace_id, name, icon, description, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *'
            : 'INSERT INTO databases(workspace_id, name, icon, description, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          withId
            ? [parsed.data.id, parsed.data.workspaceId, parsed.data.name, parsed.data.icon ?? null, parsed.data.description ?? null, (req as any).userId]
            : [parsed.data.workspaceId, parsed.data.name, parsed.data.icon ?? null, parsed.data.description ?? null, (req as any).userId])
        const dbId = (d[0] as any).id
        for (const p of parsed.data.properties ?? []) {
          await pgQuery('INSERT INTO database_properties(id, database_id, name, type, options, relation_database_id, width, visible) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
            [isUuidLike(p.id) ? p.id : null, dbId, p.name, p.type, p.options ? JSON.stringify(p.options) : null, p.relationDatabaseId ?? null, p.width ?? null, p.visible ?? true])
        }
        const views = parsed.data.views?.length ? parsed.data.views : [{ name: 'Table', type: 'table' }]
        for (const v of views) {
          await pgQuery('INSERT INTO database_views(id, database_id, name, type, filter, sort, group_by, visible_properties) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
            [isUuidLike(v.id) ? v.id : null, dbId, v.name, v.type, v.filter ? JSON.stringify(v.filter) : null, v.sort ? JSON.stringify(v.sort) : null, v.groupBy ?? null, v.visibleProperties ? JSON.stringify(v.visibleProperties) : null])
        }
        const full = await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d WHERE d.id=$1', [dbId])
        const fd: any = full[0]
        return res.status(201).json({
          id: fd.id, workspaceId: fd.workspace_id, name: fd.name, icon: fd.icon, description: fd.description, isFavorite: fd.is_favorite ?? false,
          properties: (fd.props ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.type, options: p.options ?? undefined, relationDatabaseId: p.relation_database_id ?? undefined, width: p.width ?? undefined, visible: p.visible ?? true })),
          views: (fd.views ?? []).map((v: any) => ({ id: v.id, name: v.name, type: v.type, filter: v.filter ?? undefined, sort: v.sort ?? undefined, groupBy: v.group_by ?? undefined, visibleProperties: v.visible_properties ?? undefined })),
          createdBy: fd.created_by, createdAt: fd.created_at, updatedAt: fd.updated_at,
        })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const d = { ...parsed.data, id: parsed.data.id ?? uuid(), isFavorite: false, properties: parsed.data.properties||[], views: parsed.data.views||[{ id: uuid(), name:'Table', type:'table'}], createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.databases.push(d); saveDB()
    res.status(201).json(d)
  })
  app.patch('/api/databases/:id', authStub, async (req:any,res)=> {
    const parsed = z.object({
      name: z.string().min(1).max(100).optional(),
      icon: z.string().max(50).optional(),
      description: z.string().max(2000).optional(),
      isFavorite: z.boolean().optional(),
      properties: z.array(z.any()).optional(),
      views: z.array(z.any()).optional(),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const dbWsId = await workspaceIdForDatabase(req.params.id)
    if (!dbWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, dbWsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const sets: string[] = []
        const vals: any[] = []
        if (parsed.data.name !== undefined) { vals.push(parsed.data.name); sets.push(`name=$${vals.length}`) }
        if (parsed.data.icon !== undefined) { vals.push(parsed.data.icon); sets.push(`icon=$${vals.length}`) }
        if (parsed.data.description !== undefined) { vals.push(parsed.data.description); sets.push(`description=$${vals.length}`) }
        if (parsed.data.isFavorite !== undefined) { vals.push(parsed.data.isFavorite); sets.push(`is_favorite=$${vals.length}`) }
        if (sets.length > 0) {
          vals.push(req.params.id)
          const rows = await pgQuery(`UPDATE databases SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
          if (!rows[0]) return res.status(404).json({ error:'Not found' })
        } else {
          const exists = await pgQuery('SELECT id FROM databases WHERE id=$1', [req.params.id])
          if (!exists[0]) return res.status(404).json({ error:'Not found' })
        }
        // Wholesale schema replace (column add/rename/reorder from any client).
        if (parsed.data.properties !== undefined) {
          await pgQuery('DELETE FROM database_properties WHERE database_id=$1', [req.params.id])
          for (const p of parsed.data.properties) {
            await pgQuery('INSERT INTO database_properties(id, database_id, name, type, options, relation_database_id, width, visible) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
              [isUuidLike(p.id) ? p.id : null, req.params.id, p.name, p.type, p.options ? JSON.stringify(p.options) : null, p.relationDatabaseId ?? null, p.width ?? null, p.visible ?? true])
          }
        }
        if (parsed.data.views !== undefined) {
          await pgQuery('DELETE FROM database_views WHERE database_id=$1', [req.params.id])
          for (const v of parsed.data.views) {
            await pgQuery('INSERT INTO database_views(id, database_id, name, type, filter, sort, group_by, visible_properties) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
              [isUuidLike(v.id) ? v.id : null, req.params.id, v.name, v.type, v.filter ? JSON.stringify(v.filter) : null, v.sort ? JSON.stringify(v.sort) : null, v.groupBy ?? null, v.visibleProperties ? JSON.stringify(v.visibleProperties) : null])
          }
        }
        const rows = await pgQuery('SELECT * FROM databases WHERE id=$1', [req.params.id])
        return res.json(rows[0])
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const found = db.databases.find(x=> x.id===req.params.id)
    if (!found) return res.status(404).json({ error:'Not found' })
    Object.assign(found, parsed.data, { updatedAt: new Date().toISOString() })
    saveDB()
    res.json(found)
  })
  app.delete('/api/databases/:id', authStub, async (req:any,res)=> {
    const dbWsId = await workspaceIdForDatabase(req.params.id)
    if (!dbWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, dbWsId, (req as any).userId, 'delete')) return
    if (usingPg) {
      try {
        // properties/views/records cascade via FK; record page links SET NULL.
        const out = await pgQuery('DELETE FROM databases WHERE id=$1 RETURNING id', [req.params.id])
        if (!out[0]) return res.status(404).json({ error:'Not found' })
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const idx = db.databases.findIndex(x=> x.id===req.params.id)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    db.databases.splice(idx,1)
    db.records = db.records.filter(r=> r.databaseId!==req.params.id)
    saveDB()
    res.json({ ok:true })
  })
  app.get('/api/databases/:id/records', authStub, async (req:any,res)=> {
    // Pagination contract (both backends): ?page&pageSize → {rows,total,page,pageSize},
    // else bare array. Postgres: COUNT(*) OVER() + LIMIT/OFFSET, stable ORDER BY.
    const recWsId = await workspaceIdForDatabase(req.params.id)
    if (!recWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, recWsId, (req as any).userId, 'view')) return
    const pageRaw = req.query.page as string | undefined
    const sizeRaw = req.query.pageSize as string | undefined
    const paginated = pageRaw !== undefined || sizeRaw !== undefined
    const parsed = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(500).default(50),
    }).safeParse({ page: pageRaw ?? 1, pageSize: sizeRaw ?? 50 })
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const { page, pageSize } = parsed.data
    if (usingPg) {
      try {
        if (!paginated) {
          const rows = await pgQuery('SELECT * FROM database_records WHERE database_id=$1 ORDER BY position NULLS LAST, id', [req.params.id])
          return res.json(rows.map(mapRecord))
        }
        const rows = await pgQuery(
          'SELECT *, COUNT(*) OVER() AS total FROM database_records WHERE database_id=$1 ORDER BY position NULLS LAST, id LIMIT $2 OFFSET $3',
          [req.params.id, pageSize, (page - 1) * pageSize],
        )
        const total = rows[0] ? Number((rows[0] as any).total) : 0
        return res.json({ rows: rows.map(mapRecord), total, page, pageSize })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const all = db.records.filter(r=> r.databaseId===req.params.id)
    if (!paginated) return res.json(all)
    const start = (page - 1) * pageSize
    res.json({ rows: all.slice(start, start + pageSize), total: all.length, page, pageSize })
  })
  app.post('/api/databases/:id/records', authStub, async (req:any,res)=> {
    const parsed = z.object({ id: uuidOrAbsent, properties: z.record(z.string(), z.any()).optional(), pageId: z.string().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const postWsId = await workspaceIdForDatabase(req.params.id)
    if (!postWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, postWsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const cnt = await pgQuery('SELECT COUNT(*) AS n FROM database_records WHERE database_id=$1', [req.params.id])
        const pos = Number((cnt[0] as any)?.n ?? 0)
        const withId = !!parsed.data.id
        const rows = await pgQuery(
          withId
            ? 'INSERT INTO database_records(id, database_id, properties, page_id, position, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *'
            : 'INSERT INTO database_records(database_id, properties, page_id, position, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          withId
            ? [parsed.data.id, req.params.id, JSON.stringify(parsed.data.properties ?? {}), parsed.data.pageId ?? null, pos, (req as any).userId]
            : [req.params.id, JSON.stringify(parsed.data.properties ?? {}), parsed.data.pageId ?? null, pos, (req as any).userId])
        return res.status(201).json(mapRecord(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const rec = { id: parsed.data.id ?? uuid(), databaseId: req.params.id, properties: parsed.data.properties||{}, pageId: parsed.data.pageId, position: db.records.filter(r=> r.databaseId===req.params.id).length, createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.records.push(rec); saveDB()
    res.status(201).json(rec)
  })
  app.patch('/api/records/:id', authStub, async (req:any,res)=> {
    const recWsId = await workspaceIdForRecord(req.params.id)
    if (!recWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, recWsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const props = req.body.properties ?? req.body
        const rows = await pgQuery(
          'UPDATE database_records SET properties = properties || $1::jsonb, page_id = COALESCE($2, page_id), updated_at=NOW() WHERE id=$3 RETURNING *',
          [JSON.stringify(props), req.body.pageId ?? null, req.params.id],
        )
        if (!rows[0]) return res.status(404).json({ error:'Not found' })
        return res.json(mapRecord(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const r = db.records.find(x=> x.id===req.params.id)
    if (!r) return res.status(404).json({ error:'Not found' })
    r.properties = { ...r.properties, ...(req.body.properties||req.body) }
    if (req.body.pageId !== undefined) r.pageId = req.body.pageId
    r.updatedAt = new Date().toISOString()
    saveDB()
    res.json(r)
  })
  app.delete('/api/records/:id', authStub, async (req:any,res)=> {
    const delWsId = await workspaceIdForRecord(req.params.id)
    if (!delWsId) return res.status(404).json({ error:'Not found' })
    if (!await requireWorkspaceAction(res, delWsId, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const out = await pgQuery('DELETE FROM database_records WHERE id=$1 RETURNING id', [req.params.id])
        if (!out[0]) return res.status(404).json({ error:'Not found' })
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const idx = db.records.findIndex(x=> x.id===req.params.id)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    db.records.splice(idx,1); saveDB()
    res.json({ ok:true })
  })
}

import type { Express } from 'express'
import { usingPg, pgQuery, mapFile } from '../pg.js'
import { validateFileInput, sanitizeFilename } from '../security.js'
import { authStub, accessibleWorkspaceIds, requireWorkspaceAction } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerFileRoutes(app: Express) {
  // Files — metadata only (bytes live in the storage provider). Reads need
  // viewer+, uploads need editor+. Unfiltered lists are scoped to accessible
  // workspaces.
  app.get('/api/files', authStub, async (req:any,res)=> {
    const workspaceId = req.query.workspaceId as string | undefined
    const userId = (req as any).userId as string
    if (workspaceId && !await requireWorkspaceAction(res, workspaceId, userId, 'view')) return
    const allowed = workspaceId ? null : await accessibleWorkspaceIds(userId)
    if (usingPg) {
      try {
        const rows = workspaceId
          ? await pgQuery('SELECT * FROM files WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100', [workspaceId])
          : await pgQuery('SELECT * FROM files ORDER BY created_at DESC LIMIT 100')
        const mapped = rows.map(mapFile)
        return res.json(allowed ? mapped.filter((f: any)=> f.workspaceId == null || allowed.has(String(f.workspaceId))) : mapped)
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    let files = db.files
    if (workspaceId) files = files.filter((f: any)=> f.workspaceId===workspaceId)
    else if (allowed) files = files.filter((f: any)=> f.workspaceId == null || allowed.has(String(f.workspaceId)))
    res.json(files)
  })
  app.post('/api/files', authStub, async (req:any,res)=> {
    const fileError = validateFileInput(req.body)
    if (fileError) return res.status(400).json({ error: fileError })
    if (req.body.workspaceId && !await requireWorkspaceAction(res, req.body.workspaceId, (req as any).userId, 'edit')) return
    const filename = sanitizeFilename(req.body.filename)
    const mimeType = (typeof req.body.mimeType === 'string' && req.body.mimeType ? req.body.mimeType.toLowerCase().split(';')[0].trim() : 'application/octet-stream')
    const size = req.body.size === undefined ? 0 : Number(req.body.size)
    const clientId = typeof req.body.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.body.id) ? req.body.id : null
    if (usingPg) {
      try {
        const rows = clientId
          ? await pgQuery(
              'INSERT INTO files(id, workspace_id, filename, mime_type, size, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING RETURNING *',
              [clientId, req.body.workspaceId ?? null, filename, mimeType, size, `files/${uuid()}`, (req as any).userId],
            )
          : await pgQuery(
              'INSERT INTO files(workspace_id, filename, mime_type, size, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
              [req.body.workspaceId ?? null, filename, mimeType, size, `files/${uuid()}`, (req as any).userId],
            )
        if (!rows[0] && clientId) {
          const existing = await pgQuery('SELECT * FROM files WHERE id=$1', [clientId])
          if (existing[0]) return res.status(200).json(mapFile(existing[0]))
        }
        return res.status(201).json(mapFile(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    if (clientId && db.files.some((f: any)=> f.id===clientId)) return res.status(200).json(db.files.find((f: any)=> f.id===clientId))
    const f = { id: clientId ?? uuid(), workspaceId: req.body.workspaceId, filename, mimeType, size, storageKey:`files/${uuid()}`, uploadedBy: (req as any).userId, createdAt: new Date().toISOString() }
    db.files.push(f); saveDB()
    res.status(201).json(f)
  })
  app.delete('/api/files/:id', authStub, async (req:any,res)=> {
    if (usingPg) {
      try {
        const cur = await pgQuery('SELECT workspace_id FROM files WHERE id=$1', [req.params.id])
        if (!cur[0]) return res.status(404).json({ error:'Not found' })
        const wsId = (cur[0] as any).workspace_id as string | null
        if (wsId && !await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
        await pgQuery('DELETE FROM files WHERE id=$1', [req.params.id])
        return res.json({ ok:true })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const idx = db.files.findIndex((f: any)=> f.id===req.params.id)
    if (idx===-1) return res.status(404).json({ error:'Not found' })
    const wsId = db.files[idx].workspaceId
    if (wsId && !await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
    db.files.splice(idx,1); saveDB()
    res.json({ ok:true })
  })
}

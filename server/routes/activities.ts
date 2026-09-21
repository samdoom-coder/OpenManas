import type { Express } from 'express'
import { z } from 'zod'
import { usingPg, pgQuery, mapActivity } from '../pg.js'
import { authStub, accessibleWorkspaceIds, getWorkspaceRole, requireWorkspaceAction, uuidOrAbsent } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerActivityRoutes(app: Express) {
  // Activities — workspace feed. Clients push lightweight events (page/record/
  // comment actions); the server stamps userId from auth (no spoofing).
  // Pull is newest-first, capped (same contract on both backends). Reads need
  // viewer+; unfiltered pulls are scoped to accessible workspaces.
  app.get('/api/activities', authStub, async (req:any,res)=> {
    const ws = req.query.workspaceId as string | undefined
    const userId = (req as any).userId as string
    if (ws && !await requireWorkspaceAction(res, ws, userId, 'view')) return
    const allowed = ws ? null : await accessibleWorkspaceIds(userId)
    if (usingPg) {
      try {
        const rows = ws
          ? await pgQuery('SELECT * FROM activities WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50', [ws])
          : await pgQuery('SELECT * FROM activities ORDER BY created_at DESC LIMIT 50')
        const mapped = rows.map(mapActivity)
        return res.json(allowed ? mapped.filter((a: any)=> a.workspaceId == null || allowed.has(String(a.workspaceId))) : mapped)
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    let acts = db.activities
    if (ws) acts = acts.filter(a=> a.workspaceId===ws)
    else if (allowed) acts = acts.filter((a: any)=> a.workspaceId == null || allowed.has(String(a.workspaceId)))
    res.json(acts.slice(0,50))
  })
  app.post('/api/activities', authStub, async (req:any,res)=> {
    const parsed = z.object({
      id: uuidOrAbsent,
      workspaceId: z.string().min(1),
      action: z.enum(['page_created','page_updated','block_created','block_deleted','record_created','record_updated','comment_added','file_uploaded','page_shared','page_archived','page_favorited','database_created','database_deleted','task_assigned','mention']),
      targetId: z.string().min(1).max(100),
      targetType: z.string().min(1).max(50),
      metadata: z.record(z.string(), z.any()).optional(),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const { role, missing } = await getWorkspaceRole(parsed.data.workspaceId, (req as any).userId)
    if (missing) return res.status(404).json({ error: 'Workspace not found' })
    if (!role) return res.status(403).json({ error: 'Not a workspace member' })
    if (usingPg) {
      try {
        const withId = !!parsed.data.id
        const rows = await pgQuery(
          withId
            ? 'INSERT INTO activities(id, workspace_id, user_id, action, target_id, target_type, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING RETURNING *'
            : 'INSERT INTO activities(workspace_id, user_id, action, target_id, target_type, metadata) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          withId
            ? [parsed.data.id, parsed.data.workspaceId, (req as any).userId, parsed.data.action, parsed.data.targetId, parsed.data.targetType, parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null]
            : [parsed.data.workspaceId, (req as any).userId, parsed.data.action, parsed.data.targetId, parsed.data.targetType, parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null],
        )
        if (!rows[0] && withId) {
          const existing = await pgQuery('SELECT * FROM activities WHERE id=$1', [parsed.data.id])
          if (existing[0]) return res.status(200).json(mapActivity(existing[0]))
        }
        return res.status(201).json(mapActivity(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    if (parsed.data.id && db.activities.some(a=> a.id===parsed.data.id)) {
      return res.status(200).json(db.activities.find(a=> a.id===parsed.data.id))
    }
    const a = { id: parsed.data.id ?? uuid(), workspaceId: parsed.data.workspaceId, userId: (req as any).userId, action: parsed.data.action, targetId: parsed.data.targetId, targetType: parsed.data.targetType, metadata: parsed.data.metadata, createdAt: new Date().toISOString() }
    db.activities.unshift(a); db.activities = db.activities.slice(0, 200); saveDB()
    res.status(201).json(a)
  })
}

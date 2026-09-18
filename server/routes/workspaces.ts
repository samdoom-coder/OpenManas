import type { Express } from 'express'
import { z } from 'zod'
import { usingPg, pgQuery, mapWorkspace } from '../pg.js'
import { authStub, accessibleWorkspaceIds, getWorkspaceRole, requireWorkspaceAction } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerWorkspaceRoutes(app: Express) {
  // Workspaces — list only what the caller can access (owned, membered,
  // or legacy-open). Creating is open to any authenticated user (they become
  // owner via owner_id).
  app.get('/api/workspaces', authStub, async (req:any, res)=> {
    const allowed = await accessibleWorkspaceIds((req as any).userId)
    if (usingPg) {
      try { return res.json((await pgQuery('SELECT * FROM workspaces ORDER BY created_at')).map(mapWorkspace).filter((w: any)=> allowed.has(String(w.id)))) } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    res.json(db.workspaces.filter((w: any)=> allowed.has(String(w.id))))
  })
  app.post('/api/workspaces', authStub, async (req:any, res)=> {
    const parsed = z.object({ name: z.string().min(1), icon: z.string().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (usingPg) {
      try {
        const rows = await pgQuery('INSERT INTO workspaces(name, icon, owner_id) VALUES ($1,$2,$3) RETURNING *', [parsed.data.name, parsed.data.icon ?? null, (req as any).userId])
        // Owner membership from birth: without a member row the workspace
        // counts as "legacy-open" and is visible to EVERY user (the same
        // second-login-sees-first-account's-data symptom as the JSON backend
        // had). Best-effort so creation never fails on this.
        await pgQuery(
          `INSERT INTO workspace_members(workspace_id, user_id, role) VALUES ($1,$2,'owner')
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role='owner'`,
          [(rows[0] as any).id, (req as any).userId],
        ).catch(() => [])
        return res.status(201).json(mapWorkspace(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const ws = { id: uuid(), name: parsed.data.name, icon: parsed.data.icon, ownerId: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.workspaces.push(ws); saveDB()
    res.status(201).json(ws)
  })
  app.patch('/api/workspaces/:id', authStub, async (req:any, res)=> {
    const parsed = z.object({
      name: z.string().min(1).max(100).optional(),
      // 500KB: emoji is bytes, but uploaded custom icons are resized data: URLs.
      icon: z.string().max(500000).nullable().optional(),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (parsed.data.name === undefined && parsed.data.icon === undefined) {
      return res.status(400).json({ error: 'Nothing to update (name and/or icon required)' })
    }
    if (!await requireWorkspaceAction(res, req.params.id, (req as any).userId, 'edit')) return
    if (usingPg) {
      try {
        const sets: string[] = []
        const vals: any[] = []
        if (parsed.data.name !== undefined) { vals.push(parsed.data.name); sets.push(`name=$${vals.length}`) }
        if (parsed.data.icon !== undefined) { vals.push(parsed.data.icon); sets.push(`icon=$${vals.length}`) }
        vals.push(req.params.id)
        const rows = await pgQuery(`UPDATE workspaces SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
        if (!rows[0]) return res.status(404).json({ error: 'Workspace not found' })
        return res.json(mapWorkspace(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const w = db.workspaces.find((x: any)=> x.id===req.params.id)
    if (!w) return res.status(404).json({ error: 'Workspace not found' })
    if (parsed.data.name !== undefined) w.name = parsed.data.name
    if (parsed.data.icon !== undefined) w.icon = parsed.data.icon ?? undefined
    w.updatedAt = new Date().toISOString()
    saveDB()
    res.json(w)
  })

  // Workspace members — per-user ACL backing (slice 4).
  // Owner + admins manage; any member can list. Legacy open workspaces
  // (zero members) skip checks so single-user flows keep working.
  app.get('/api/workspaces/:id/members', authStub, async (req:any,res)=> {
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT id, workspace_id, user_id, role, joined_at FROM workspace_members WHERE workspace_id=$1 ORDER BY joined_at', [req.params.id])
        return res.json(rows.map((r: any)=> ({ id: r.id, workspaceId: r.workspace_id, userId: r.user_id, role: r.role, joinedAt: r.joined_at })))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    res.json([])
  })
  app.post('/api/workspaces/:id/members', authStub, async (req:any,res)=> {
    const parsed = z.object({
      userId: z.string().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(['admin', 'editor', 'commenter', 'viewer']).default('editor'),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (!parsed.data.userId && !parsed.data.email) return res.status(400).json({ error: 'userId or email is required' })
    const { role: callerRole, missing } = await getWorkspaceRole(req.params.id, (req as any).userId)
    if (missing) return res.status(404).json({ error: 'Workspace not found' })
    if (!callerRole || !(callerRole === 'owner' || callerRole === 'admin')) {
      // Legacy open workspace: first invite is allowed to bootstrap membership.
      if (callerRole !== 'editor') return res.status(403).json({ error: 'Only owners/admins can invite members' })
    }
    if (usingPg) {
      try {
        let targetId = parsed.data.userId ?? null
        if (!targetId && parsed.data.email) {
          const u = await pgQuery('SELECT id FROM users WHERE email=$1', [parsed.data.email.toLowerCase()])
          if (!u[0]) return res.status(404).json({ error: 'User not found' })
          targetId = (u[0] as any).id
        }
        const rows = await pgQuery(
          'INSERT INTO workspace_members(workspace_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role=EXCLUDED.role RETURNING id, workspace_id, user_id, role, joined_at',
          [req.params.id, targetId, parsed.data.role],
        )
        const r: any = rows[0]
        return res.status(201).json({ id: r.id, workspaceId: r.workspace_id, userId: r.user_id, role: r.role, joinedAt: r.joined_at })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    res.status(201).json({ id: uuid(), workspaceId: req.params.id, userId: parsed.data.userId ?? parsed.data.email, role: parsed.data.role, joinedAt: new Date().toISOString() })
  })
}

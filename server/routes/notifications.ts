import type { Express } from 'express'
import { z } from 'zod'
import { usingPg, pgQuery, mapNotification } from '../pg.js'
import { authStub, notificationSchema } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerNotificationRoutes(app: Express) {
  // Notifications — per-user inbox fed by the automation bus (slice 4).
  // userId is always the caller (no spoofing); automation targets resolve
  // client-side to the actor for v1, with link carrying the shared target so
  // any member opening it lands on the right page/record.
  app.get('/api/notifications', authStub, async (req:any,res)=> {
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [(req as any).userId])
        return res.json(rows.map(mapNotification))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    res.json(db.notifications.filter(n=> n.userId===(req as any).userId).slice(0,50))
  })
  app.post('/api/notifications', authStub, async (req:any,res)=> {
    const parsed = notificationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (usingPg) {
      try {
        const withId = !!parsed.data.id
        const rows = await pgQuery(
          withId
            ? 'INSERT INTO notifications(id, user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING *'
            : 'INSERT INTO notifications(user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          withId
            ? [parsed.data.id, (req as any).userId, parsed.data.type, parsed.data.title, parsed.data.body ?? null, parsed.data.link ?? null]
            : [(req as any).userId, parsed.data.type, parsed.data.title, parsed.data.body ?? null, parsed.data.link ?? null],
        )
        if (!rows[0] && withId) {
          const existing = await pgQuery('SELECT * FROM notifications WHERE id=$1 AND user_id=$2', [parsed.data.id, (req as any).userId])
          if (existing[0]) return res.status(200).json(mapNotification(existing[0]))
        }
        return res.status(201).json(mapNotification(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    if (parsed.data.id && db.notifications.some(n=> n.id===parsed.data.id)) {
      return res.status(200).json(db.notifications.find(n=> n.id===parsed.data.id))
    }
    const n = { id: parsed.data.id ?? uuid(), userId: (req as any).userId, type: parsed.data.type, title: parsed.data.title, body: parsed.data.body, link: parsed.data.link, read: false, createdAt: new Date().toISOString() }
    db.notifications.unshift(n); db.notifications = db.notifications.slice(0, 200); saveDB()
    res.status(201).json(n)
  })
  app.patch('/api/notifications/:id', authStub, async (req:any,res)=> {
    const parsed = z.object({ read: z.boolean() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    if (usingPg) {
      try {
        const rows = await pgQuery('UPDATE notifications SET read=$1 WHERE id=$2 AND user_id=$3 RETURNING *', [parsed.data.read, req.params.id, (req as any).userId])
        if (!rows[0]) return res.status(404).json({ error:'Not found' })
        return res.json(mapNotification(rows[0]))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const n = db.notifications.find(x=> x.id===req.params.id && x.userId===(req as any).userId)
    if (!n) return res.status(404).json({ error:'Not found' })
    n.read = parsed.data.read
    saveDB()
    res.json(n)
  })
}

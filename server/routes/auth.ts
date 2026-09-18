import type { Express } from 'express'
import { z } from 'zod'
import { usingPg, pgQuery, mapUser } from '../pg.js'
import { hashPassword, verifyPassword, signToken } from '../auth.js'
import { authLimiter } from '../security.js'
import { authStub, profilePatchSchema, publicUser, validAvatarValue } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

export function registerAuthRoutes(app: Express) {
  // Auth: bcrypt + JWT when Postgres is configured, stub-compatible otherwise.
  // Login accepts legacy users without password_hash (returns demo-token path);
  // new registrations always store bcrypt hashes. Clients send
  // `Authorization: Bearer <jwt>`; `demo-token` + `x-user-id` still works.
  app.post('/api/auth/login', authLimiter, async (req,res)=> {
    const parsed = z.object({ email: z.string().email(), password: z.string().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const { email, password } = parsed.data
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])
        const u = rows[0] as any
        if (!u) return res.status(401).json({ error: 'Invalid credentials' })
        if (u.password_hash) {
          if (!password || !(await verifyPassword(password, u.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' })
          }
          return res.json({ user: mapUser(u), token: signToken(u.id) })
        }
        // legacy row without hash (seeded before bcrypt): allow, then set hash if provided
        if (password) {
          const hash = await hashPassword(password)
          await pgQuery('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, u.id])
          return res.json({ user: mapUser(u), token: signToken(u.id) })
        }
        return res.json({ user: mapUser(u), token: 'demo-token' })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const user = db.users.find((x: any) => x.email === email)
    if (user && (user as any).passwordHash) {
      if (!password || !(await verifyPassword(password, (user as any).passwordHash))) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      return res.json({ user: publicUser(user), token: signToken(user.id) })
    }
    if (user) return res.json({ user: publicUser(user), token: 'demo-token' })
    // Unknown email: provision a DISTINCT identity instead of the old shared
    // 'u1' stub. The stub made every demo-token login the same server-side
    // user, so a second login in the same browser saw the first account's
    // data. (Open registration already exists, so this adds no new threat.)
    const local = String(email.split('@')[0] || 'user').replace(/[._-]+/g, ' ').trim() || 'user'
    const freshName = local.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const freshHash = password && password.length >= 8 ? await hashPassword(password) : null
    const fresh = { id: uuid(), email, name: freshName, passwordHash: freshHash, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.users.push(fresh); saveDB()
    res.json({ user: publicUser(fresh), token: freshHash ? signToken(fresh.id) : 'demo-token' })
  })
  app.post('/api/auth/register', authLimiter, async (req,res)=> {
    const parsed = z.object({ email: z.string().email(), name: z.string().min(1), password: z.string().min(8).optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const { email, name, password } = parsed.data
    const hash = password ? await hashPassword(password) : null
    if (usingPg) {
      try {
        const existing = await pgQuery('SELECT id FROM users WHERE email=$1', [email.toLowerCase()])
        if (existing[0]) return res.status(409).json({ error: 'Email already registered' })
        const rows = await pgQuery('INSERT INTO users(email, name, password_hash) VALUES ($1,$2,$3) RETURNING *', [email.toLowerCase(), name, hash])
        const user = mapUser(rows[0])
        return res.status(201).json({ user, token: hash ? signToken(user.id) : 'demo-token' })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    if (db.users.some((x: any) => x.email === email)) return res.status(409).json({ error: 'Email already registered' })
    const user = { id: uuid(), email, name, passwordHash: hash, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.users.push(user); saveDB()
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, token: hash ? signToken(user.id) : 'demo-token' })
  })

  // Profile — the Settings → Account avatar upload writes here via
  // sync.patchProfile(). Avatars are resized data: URLs (<=256px) from the
  // client, so the body stays small (express.json limit is 10mb).
  app.get('/api/users/me', authStub, async (req:any,res)=> {
    const userId = (req as any).userId
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM users WHERE id=$1', [userId])
        if (!rows[0]) return res.status(404).json({ error: 'Not found' })
        return res.json({ user: mapUser(rows[0]) })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const user = db.users.find((x: any) => x.id === userId)
    if (!user) return res.status(404).json({ error: 'Not found' })
    res.json({ user: publicUser(user) })
  })

  app.patch('/api/users/me', authStub, async (req:any,res)=> {
    const parsed = profilePatchSchema.safeParse(req.body ?? {})
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const { name, email, avatar } = parsed.data
    if (avatar !== undefined && !validAvatarValue(avatar)) {
      return res.status(400).json({ error: 'Invalid avatar — expected a data:image/... URL' })
    }
    const userId = (req as any).userId
    if (usingPg) {
      try {
        if (email !== undefined) {
          const existing = await pgQuery('SELECT id FROM users WHERE email=$1 AND id<>$2', [email.toLowerCase(), userId])
          if (existing[0]) return res.status(409).json({ error: 'Email already registered' })
        }
        const sets: string[] = []
        const vals: any[] = []
        let i = 1
        if (name !== undefined) { sets.push(`name=$${i++}`); vals.push(name) }
        if (email !== undefined) { sets.push(`email=$${i++}`); vals.push(email.toLowerCase()) }
        if (avatar !== undefined) { sets.push(`avatar=$${i++}`); vals.push(avatar) }
        sets.push(`updated_at=NOW()`)
        vals.push(userId)
        const rows = await pgQuery(`UPDATE users SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals)
        if (!rows[0]) return res.status(404).json({ error: 'Not found' })
        return res.json({ user: mapUser(rows[0]) })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    let user = db.users.find((x: any) => x.id === userId)
    if (!user) {
      // demo-token stub with no persisted row yet: create it so the avatar sticks
      user = { id: userId, email: 'alex@openmanas.app', name: 'Alex Rivera', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      db.users.push(user)
    }
    if (email !== undefined) {
      if (db.users.some((x: any) => x.email === email && x.id !== userId)) {
        return res.status(409).json({ error: 'Email already registered' })
      }
      user.email = email
    }
    if (name !== undefined) user.name = name
    if (avatar !== undefined) user.avatar = avatar
    user.updatedAt = new Date().toISOString()
    saveDB()
    res.json({ user: publicUser(user) })
  })
}

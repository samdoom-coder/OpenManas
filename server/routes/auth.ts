import type { Express } from 'express'
import { z } from 'zod'
import { usingPg, pgQuery, mapUser } from '../pg.js'
import { hashPassword, verifyPassword, signToken } from '../auth.js'
import { authLimiter, authBypassAllowed } from '../security.js'
import { authStub, profilePatchSchema, publicUser, validAvatarValue } from '../helpers.js'
import { db, saveDB } from '../state.js'
import { v4 as uuid } from 'uuid'

// Dummy bcrypt hash used for constant-time comparison when the account
// doesn't exist — prevents user-enumeration via login timing.
const DUMMY_HASH = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0j4556'

export function registerAuthRoutes(app: Express) {
  // Auth: bcrypt + JWT when Postgres is configured, stub-compatible otherwise.
  // Login accepts legacy users without password_hash (returns demo-token path);
  // new registrations always store bcrypt hashes. Clients send
  // `Authorization: Bearer <jwt>`; `demo-token` + `x-user-id` still works.
  app.post('/api/auth/login', authLimiter, async (req,res)=> {
    const parsed = z.object({ email: z.string().email(), password: z.string().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const email = parsed.data.email.toLowerCase().trim()
    const password = parsed.data.password
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM users WHERE email=$1', [email])
        const u = rows[0] as any
        if (!u) {
          // Constant-time dummy check so unknown emails don't return faster.
          await verifyPassword(password ?? '', DUMMY_HASH)
          return res.status(401).json({ error: 'Invalid credentials' })
        }
        if (u.password_hash) {
          if (!password || !(await verifyPassword(password, u.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' })
          }
          return res.json({ user: mapUser(u), token: signToken(u.id) })
        }
        // legacy row without hash (seeded before bcrypt): allow, then set hash if provided
        if (password) {
          if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
          const hash = await hashPassword(password)
          await pgQuery('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, u.id])
          return res.json({ user: mapUser(u), token: signToken(u.id) })
        }
        // Passwordless legacy accounts: demo-token only where bypass allowed.
        if (!authBypassAllowed()) return res.status(401).json({ error: 'Password required — set a password for this account' })
        return res.json({ user: mapUser(u), token: 'demo-token' })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    const user = db.users.find((x: any) => String(x.email).toLowerCase() === email)
    if (user && (user as any).passwordHash) {
      if (!password || !(await verifyPassword(password, (user as any).passwordHash))) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      return res.json({ user: publicUser(user), token: signToken(user.id) })
    }
    if (user) {
      if (!authBypassAllowed()) return res.status(401).json({ error: 'Password required — set a password for this account' })
      return res.json({ user: publicUser(user), token: 'demo-token' })
    }
    // Unknown email: provision a DISTINCT identity instead of the old shared
    // 'u1' stub. The stub made every demo-token login the same server-side
    // user, so a second login in the same browser saw the first account's
    // data. (Open registration already exists, so this adds no new threat.)
    // In production, unknown emails + passwordless logins are rejected —
    // use /api/auth/register instead.
    if (!authBypassAllowed()) {
      await verifyPassword(password ?? '', DUMMY_HASH)
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const local = String(email.split('@')[0] || 'user').replace(/[._-]+/g, ' ').trim() || 'user'
    const freshName = local.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const freshHash = password && password.length >= 8 ? await hashPassword(password) : null
    const fresh = { id: uuid(), email, name: freshName, passwordHash: freshHash, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    db.users.push(fresh); saveDB()
    res.json({ user: publicUser(fresh), token: freshHash ? signToken(fresh.id) : 'demo-token' })
  })
  app.post('/api/auth/register', authLimiter, async (req,res)=> {
    const parsed = z.object({ email: z.string().email(), name: z.string().min(1).max(100), password: z.string().min(8).max(128).optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const email = parsed.data.email.toLowerCase().trim()
    const name = parsed.data.name.trim()
    const password = parsed.data.password
    // Passwordless registration is a dev-only convenience; production
    // requires a password so every account has a real credential.
    if (!password && !authBypassAllowed()) {
      return res.status(400).json({ error: 'Password required (min 8 characters)' })
    }
    const hash = password ? await hashPassword(password) : null
    if (usingPg) {
      try {
        const existing = await pgQuery('SELECT id FROM users WHERE email=$1', [email])
        if (existing[0]) return res.status(409).json({ error: 'Email already registered' })
        const rows = await pgQuery('INSERT INTO users(email, name, password_hash) VALUES ($1,$2,$3) RETURNING *', [email, name, hash])
        const user = mapUser(rows[0])
        if (!hash && !authBypassAllowed()) return res.status(400).json({ error: 'Password required (min 8 characters)' })
        return res.status(201).json({ user, token: hash ? signToken(user.id) : 'demo-token' })
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    if (db.users.some((x: any) => String(x.email).toLowerCase() === email)) return res.status(409).json({ error: 'Email already registered' })
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
      const normalizedEmail = email.toLowerCase().trim()
      if (db.users.some((x: any) => String(x.email).toLowerCase() === normalizedEmail && x.id !== userId)) {
        return res.status(409).json({ error: 'Email already registered' })
      }
      user.email = normalizedEmail
    }
    if (name !== undefined) user.name = name
    if (avatar !== undefined) user.avatar = avatar
    user.updatedAt = new Date().toISOString()
    saveDB()
    res.json({ user: publicUser(user) })
  })
}

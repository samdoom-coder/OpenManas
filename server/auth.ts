// Auth: bcrypt password hashing + JWT sessions.
// Backward compatible: `demo-token` / `x-user-id: u1` stub still works when
// no JWT is provided, so existing clients and tests keep working.
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const SALT_ROUNDS = 10

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false
  try { return await bcrypt.compare(password, hash) } catch { return false }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub?: string }
    return decoded.sub ?? null
  } catch { return null }
}

// Express middleware: sets req.userId from Bearer JWT, else stub headers.
export function authMiddleware(req: any, _res: any, next: any) {
  const header = String(req.headers.authorization || '')
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7)
    if (token === 'demo-token') { req.userId = String(req.headers['x-user-id'] || 'u1'); return next() }
    const sub = verifyToken(token)
    if (sub) { req.userId = sub; return next() }
    // fall through to stub (don't hard-fail during migration)
  }
  req.userId = req.headers['x-user-id'] || 'u1'
  next()
}

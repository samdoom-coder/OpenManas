// Auth: bcrypt password hashing + JWT sessions.
//
// Hardened: Bearer JWT is the only credential in production.
// The `demo-token` / `x-user-id` backdoors only work when
// `authBypassAllowed()` (non-production and REQUIRE_AUTH != '1'),
// so zero-setup dev and existing tests keep working while prod
// fails closed with 401 instead of silently accepting spoofed ids.
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authBypassAllowed, jwtSecretIsDefault, isProduction } from './security.js'

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET || 'dev-secret-change-me'
  if (isProduction() && jwtSecretIsDefault()) {
    throw new Error('[security] JWT_SECRET must be set to a long random value in production.')
  }
  return s
}

// bcrypt cost 12 (~250ms) — brute-force resistant without DoS-ing login.
const SALT_ROUNDS = 12

// Short-lived access tokens. Override with JWT_EXPIRES_IN (e.g. '1d', '12h').
const TOKEN_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false
  try { return await bcrypt.compare(password, hash) } catch { return false }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), {
    expiresIn: TOKEN_EXPIRES_IN as any,
    algorithm: 'HS256',
    issuer: 'openmanas',
  })
}

export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'openmanas',
    }) as { sub?: string }
    return decoded.sub ?? null
  } catch { return null }
}

// Express middleware: sets req.userId from a valid Bearer JWT.
// - Valid JWT → req.userId = sub, next()
// - `demo-token` + optional `x-user-id` → allowed only when bypass allowed
// - Otherwise: 401 in production (fail closed), legacy stub identity in dev
export function authMiddleware(req: any, res: any, next: any) {
  const header = String(req.headers.authorization || '')
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7)
    if (token === 'demo-token') {
      if (authBypassAllowed()) {
        req.userId = String(req.headers['x-user-id'] || 'u1')
        return next()
      }
      return res?.status?.(401).json({ error: 'Invalid or expired token' })
    }
    const sub = verifyToken(token)
    if (sub) { req.userId = sub; return next() }
    // Invalid/expired JWT: fail closed in prod, legacy fallthrough in dev.
    if (!authBypassAllowed()) {
      return res?.status?.(401).json({ error: 'Invalid or expired token' })
    }
    // fall through to stub (don't hard-fail during migration)
  } else if (!authBypassAllowed()) {
    // No credential at all in production → 401, never a stub identity.
    return res?.status?.(401).json({ error: 'Authentication required' })
  }
  req.userId = req.headers['x-user-id'] || 'u1'
  next()
}

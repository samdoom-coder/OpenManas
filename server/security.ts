// Security helpers: headers (helmet), rate limiting, file/input validation.
// Pure validators (validateFileInput, sanitizeFilename) are unit-tested in
// tests/security.test.ts. Rate limiters use in-memory stores — sufficient for
// single-instance deploys; switch to a Redis store for multi-instance prod.
import path from 'path'
import { rateLimit } from 'express-rate-limit'

const num = (v: string | undefined, fallback: number) => {
  const n = v !== undefined ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// --- CORS ---
// CORS_ORIGIN: comma-separated allowlist, e.g. "https://app.example.com".
// Unset → permissive (dev / zero-setup). Set it in production.
export function getCorsOrigin(): true | string[] {
  const raw = (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return raw.length > 0 ? raw : true
}

// --- Rate limits (env-overridable) ---
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: num(process.env.RATE_LIMIT_GENERAL, 1000),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down and retry.' },
})

// Brute-force guard for login/register.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: num(process.env.RATE_LIMIT_AUTH, 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try again later.' },
})

// AI generation is expensive — keep a tight budget.
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: num(process.env.RATE_LIMIT_AI, 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'AI quota exceeded, try again later.' },
})

// --- File validation ---
// Server /api/files stores metadata only (bytes live in the storage provider),
// but we still enforce size caps, filename hygiene, and a scriptable-content
// denylist so a poisoned record can't turn into stored XSS downstream.
export const FILE_MAX_SIZE = num(process.env.FILE_MAX_SIZE_MB, 25) * 1024 * 1024
export const MAX_FILENAME_LENGTH = 255

// MIME types that can execute script if ever served inline.
const BLOCKED_MIME = new Set([
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'application/ecmascript',
  'text/javascript',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-elf',
  'application/x-sh',
  'application/x-shellscript',
])

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i

// Strip directories, null bytes, and surrounding whitespace.
// Returns '' when nothing safe remains.
export function sanitizeFilename(name: unknown): string {
  if (typeof name !== 'string') return ''
  const noNulls = name.replace(/\0/g, '')
  const base = path.basename(noNulls.replace(/\\/g, '/'))
  const trimmed = base.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed === '.' || trimmed === '..') return ''
  return trimmed.slice(0, MAX_FILENAME_LENGTH)
}

export interface FileInput {
  filename?: unknown
  mimeType?: unknown
  size?: unknown
}

// Returns an error message when invalid, null when OK.
export function validateFileInput(input: FileInput): string | null {
  const filename = sanitizeFilename(input.filename)
  if (!filename) return 'filename is required'
  if (typeof input.filename === 'string' && input.filename.length > MAX_FILENAME_LENGTH + 100) {
    return `filename must be under ${MAX_FILENAME_LENGTH} characters`
  }
  const mime = typeof input.mimeType === 'string' && input.mimeType ? input.mimeType.toLowerCase().split(';')[0].trim() : 'application/octet-stream'
  if (!MIME_PATTERN.test(mime)) return 'mimeType is invalid'
  if (BLOCKED_MIME.has(mime)) return `mimeType "${mime}" is not allowed`
  const size = input.size === undefined ? 0 : Number(input.size)
  if (!Number.isFinite(size) || size < 0 || !Number.isInteger(size)) return 'size must be a non-negative integer'
  if (size > FILE_MAX_SIZE) return `file too large (max ${Math.round(FILE_MAX_SIZE / 1024 / 1024)}MB)`
  return null
}

// --- Input size caps (DoS guard on unbounded text columns) ---
export const MAX_BLOCK_CONTENT = 200_000 // ~200KB per block
export const MAX_COMMENT_CONTENT = 20_000
export const MAX_AI_PROMPT = 20_000

// --- JWT secret hygiene ---
export function jwtSecretIsDefault(): boolean {
  const s = process.env.JWT_SECRET ?? ''
  return !s || s === 'dev-secret-change-me' || s === 'change-me-to-a-long-random-string'
}

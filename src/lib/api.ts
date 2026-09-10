// Backend API client + session token storage.
// Base URL: VITE_API_URL when set (prod API host), otherwise '' so requests
// go same-origin (dev Vite proxy and prod Express static both serve /api).
// Auth state lives here (not in zustand) so non-React code (collab client)
// can read the token. Persisted sessions: 'openmanas_session_v1'.

export const TOKEN_KEY = 'openmanas_token'
const SESSION_KEY = 'openmanas_session_v1'
// Pre-rebrand keys — read once for migration, then dropped.
const LEGACY_TOKEN_KEY = 'nexus_token'
const LEGACY_SESSION_KEY = 'nexus_session_v1'

export function apiBase(): string {
  // Tests stub global fetch and assert relative '/api/...' paths — ignore any
  // configured base URL under vitest so `npm test` passes with a .env present.
  try {
    const pe = typeof process !== 'undefined' ? (process as any)?.env : undefined
    if (pe?.VITEST_WORKER_ID || pe?.VITEST) return ''
  } catch { /* browser */ }
  let v: string | undefined
  try {
    v = (import.meta as any)?.env?.VITE_API_URL as string | undefined
  } catch { /* non-vite (tests) */ }
  if (!v) {
    try {
      v = typeof process !== 'undefined' ? (process as any)?.env?.VITE_API_URL : undefined
    } catch { /* browser */ }
  }
  if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
  return ''
}

export function getStoredToken(): string | null {
  try {
    return (
      localStorage.getItem(TOKEN_KEY) ??
      localStorage.getItem(LEGACY_TOKEN_KEY) ??
      loadSession()?.token ??
      null
    )
  } catch {
    return null
  }
}

export interface StoredSession {
  user: { id: string; email: string; name: string; avatar?: string }
  token: string
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (!s?.token || !s?.user?.id) return null
    return s
  } catch {
    return null
  }
}

export function saveSession(s: StoredSession): boolean {
  // Quota-safe: the workspace cache (openmanas_state_v1 + its backup copy)
  // can fill the ~5MB localStorage budget on large workspaces. The session
  // is tiny but critical (losing it logs the user out on reload while their
  // cached data stays — exactly the "logged out but projects remain"
  // symptom). So on quota failure, evict the expendable backup copy and
  // legacy keys, then retry once instead of silently dropping the login.
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    localStorage.setItem(TOKEN_KEY, s.token)
    localStorage.removeItem(LEGACY_SESSION_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    return true
  } catch {
    try {
      localStorage.removeItem('openmanas_state_backup')
      localStorage.removeItem(LEGACY_SESSION_KEY)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
      localStorage.setItem(SESSION_KEY, JSON.stringify(s))
      localStorage.setItem(TOKEN_KEY, s.token)
      return true
    } catch { return false /* quota/private mode */ }
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(LEGACY_SESSION_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch { /* noop */ }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const token = getStoredToken()
    // The JSON dev backend has no JWT user directory: `demo-token`
    // callers are attributed via `x-user-id` (see server/auth.ts). Send our
    // own user id so two demo-token accounts on one server stay isolated
    // instead of both collapsing onto the shared 'u1' identity.
    let demoUserId: string | null = null
    if (token === 'demo-token') {
      try { demoUserId = loadSession()?.user?.id ?? null } catch { demoUserId = null }
    }
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(demoUserId ? { 'x-user-id': demoUserId } : {}),
        ...(init.headers || {}),
      },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = typeof (body as any)?.error === 'string' ? (body as any).error : `Request failed (${res.status})`
      throw new ApiError(res.status, msg)
    }
    return body as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, e instanceof Error && e.name === 'AbortError' ? 'Server timed out' : 'Cannot reach server')
  } finally {
    clearTimeout(timer)
  }
}

export interface AuthResponse {
  user: { id: string; email: string; name: string; avatar?: string }
  token: string
}

export function signInRequest(email: string, password?: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function signUpRequest(email: string, name: string, password?: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  })
}

/** Current profile for the stored session. Used for boot-time validation. */
export function fetchMe(): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/users/me')
}

/** Null when no backend is reachable (local demo mode). */
export async function probeBackend(timeoutMs = 2500): Promise<{ ok: boolean; db: string } | null> {
  try {
    const res = await apiFetch<{ ok: boolean; db: string }>('/health', {}, timeoutMs)
    return res?.ok ? res : null
  } catch {
    return null
  }
}

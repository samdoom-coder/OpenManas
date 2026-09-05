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

export function saveSession(s: StoredSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    localStorage.setItem(TOKEN_KEY, s.token)
    localStorage.removeItem(LEGACY_SESSION_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch { /* quota/private mode */ }
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
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

/** Null when no backend is reachable (local demo mode). */
export async function probeBackend(timeoutMs = 2500): Promise<{ ok: boolean; db: string } | null> {
  try {
    const res = await apiFetch<{ ok: boolean; db: string }>('/health', {}, timeoutMs)
    return res?.ok ? res : null
  } catch {
    return null
  }
}

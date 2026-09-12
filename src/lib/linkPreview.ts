// Link-preview helper for bookmark blocks.
// Strategy: try same-origin backend `/api/link-preview?url=` first (OG parsing,
// no CORS issues), fall back to microlink's free API, finally fall back to a
// domain-only card. Results are cached in-memory + localStorage (7 days).

import { apiBase } from './api'

export interface LinkPreview {
  url: string
  title: string
  description: string
  image: string
  favicon: string
  siteName: string
  domain: string
}

const MEM = new Map<string, LinkPreview>()
const LS_KEY = 'openmanas_link_preview_v1'
const TTL = 7 * 24 * 60 * 60 * 1000

function readLS(): Record<string, { data: LinkPreview; ts: number }> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, { data: LinkPreview; ts: number }>
  } catch {
    return {}
  }
}

function writeLS(url: string, data: LinkPreview) {
  try {
    const all = readLS()
    all[url] = { data, ts: Date.now() }
    // cap entries so we never blow the 5MB quota
    const keys = Object.keys(all)
    if (keys.length > 200) {
      const sorted = keys.sort((a, b) => all[a].ts - all[b].ts)
      for (const k of sorted.slice(0, keys.length - 200)) delete all[k]
    }
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch {
    /* quota / private mode — ignore */
  }
}

function readCache(url: string): LinkPreview | null {
  const mem = MEM.get(url)
  if (mem) return mem
  try {
    const entry = readLS()[url]
    if (entry && Date.now() - entry.ts < TTL) {
      MEM.set(url, entry.data)
      return entry.data
    }
  } catch {
    /* noop */
  }
  return null
}

function storeCache(url: string, data: LinkPreview) {
  MEM.set(url, data)
  writeLS(url, data)
}

export function normalizeUrl(input: string): string {
  const t = (input || '').trim()
  if (!t) return ''
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return t
  return `https://${t}`
}

export function isValidHttpUrl(input: string): boolean {
  try {
    const u = new URL(normalizeUrl(input))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function domainOf(input: string): string {
  try {
    return new URL(normalizeUrl(input)).hostname.replace(/^www\./, '')
  } catch {
    return input
  }
}

export function fallbackPreview(input: string): LinkPreview {
  const url = normalizeUrl(input)
  const domain = domainOf(url)
  let favicon = ''
  try {
    const u = new URL(url)
    favicon = `${u.origin}/favicon.ico`
  } catch {
    /* noop */
  }
  return { url, title: domain || url, description: '', image: '', favicon, siteName: '', domain }
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchLinkPreview(input: string): Promise<LinkPreview> {
  const url = normalizeUrl(input)
  if (!url || !isValidHttpUrl(url)) return fallbackPreview(input)

  const cached = readCache(url)
  if (cached) return cached

  // 1) Same-origin backend (OG parsing, no CORS issues, no third party).
  try {
    const res = await fetchWithTimeout(`${apiBase()}/api/link-preview?url=${encodeURIComponent(url)}`, 9000)
    if (res.ok) {
      const data = (await res.json()) as Partial<LinkPreview>
      if (data && (data.title || data.description || data.image)) {
        const merged: LinkPreview = { ...fallbackPreview(url), ...data, url }
        storeCache(url, merged)
        return merged
      }
    }
  } catch {
    /* fall through to microlink */
  }

  // 2) Microlink free tier (no key needed for basic meta).
  try {
    const res = await fetchWithTimeout(`https://api.microlink.io?url=${encodeURIComponent(url)}&meta=true`, 9000)
    if (res.ok) {
      const json = (await res.json()) as any
      const d = json?.data ?? {}
      const merged: LinkPreview = {
        url,
        title: String(d?.title || '') || domainOf(url),
        description: String(d?.description || ''),
        image: String(d?.image?.url || d?.screenshot?.url || ''),
        favicon: String(d?.logo?.url || ''),
        siteName: String(d?.publisher || ''),
        domain: domainOf(url),
      }
      if (!merged.favicon) {
        try {
          merged.favicon = `${new URL(url).origin}/favicon.ico`
        } catch {
          /* noop */
        }
      }
      storeCache(url, merged)
      return merged
    }
  } catch {
    /* fall through to fallback */
  }

  return fallbackPreview(url)
}

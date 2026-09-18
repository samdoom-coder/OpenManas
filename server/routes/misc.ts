import type { Express } from 'express'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { usingPg, pgOk } from '../pg.js'
import { aiLimiter, MAX_AI_PROMPT } from '../security.js'

export function registerMiscRoutes(app: Express) {
  // Health — db is the configured backend; dbOk is live reachability
  // (false + fast beats hanging when DATABASE_URL points nowhere).
  app.get('/health', async (_req, res)=> {
    const dbOk = await pgOk()
    res.json({ ok: true, at: new Date().toISOString(), db: usingPg ? 'postgres' : 'json', dbOk })
  })

  // Link preview (bookmark cards) — public, rate-limited by generalLimiter.
  // Fetches the target HTML server-side (avoids CORS) and extracts OG/Twitter
  // meta tags. No new deps: regex parsing + global fetch with timeout + size cap.
  app.get('/api/link-preview', async (req, res)=> {
    const raw = String(req.query.url || '').trim().slice(0, 2048)
    if (!raw) return res.status(400).json({ error: 'Missing ?url=' })
    let target: URL
    try {
      target = new URL(/^([a-zA-Z][a-zA-Z0-9+.-]*:)?\/\//.test(raw) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? `https:${raw}` : raw)
      if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol')
    } catch {
      return res.status(400).json({ error: 'Invalid URL (http/https only)' })
    }
    // SSRF guard: refuse loopback / link-local / private hosts by name.
    const host = target.hostname.toLowerCase()
    if (
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host === '::1' || host === '[::1]' ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) || host === '0.0.0.0'
    ) {
      return res.status(400).json({ error: 'URL host not allowed' })
    }
    const domain = host.replace(/^www\./, '')
    const fallback = { url: target.toString(), title: domain, description: '', image: '', favicon: `${target.origin}/favicon.ico`, siteName: '', domain }
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(()=> ctrl.abort(), 8000)
      let resp: Response
      try {
        resp = await fetch(target.toString(), {
          signal: ctrl.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenManas-LinkPreview/1.0)', 'Accept': 'text/html,application/xhtml+xml' },
        })
      } finally {
        clearTimeout(timer)
      }
      if (!resp.ok) return res.json(fallback)
      const ctype = String(resp.headers.get('content-type') || '')
      if (!/text\/html|application\/xhtml/i.test(ctype)) return res.json(fallback)
      const buf = await resp.arrayBuffer()
      if (!buf.byteLength) return res.json(fallback)
      const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 1_500_000)).slice(0, 500_000)
      const pick = (attr: string, name: string): string => {
        // matches <meta property="og:title" content="..."> in either attr order
        const re1 = new RegExp(`<meta[^>]*${attr}\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']{1,500})["']`, 'i')
        const re2 = new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']{1,500})["'][^>]*${attr}\\s*=\\s*["']${name}["']`, 'i')
        return (html.match(re1)?.[1] || html.match(re2)?.[1] || '').trim()
      }
      const abs = (u: string): string => {
        if (!u) return ''
        try { return new URL(u, target.toString()).toString() } catch { return '' }
      }
      const titleTag = (html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] || '').trim()
      const title = pick('property', 'og:title') || pick('name', 'twitter:title') || titleTag || domain
      const description = pick('property', 'og:description') || pick('name', 'twitter:description') || pick('name', 'description')
      const image = abs(pick('property', 'og:image') || pick('name', 'twitter:image'))
      const siteName = pick('property', 'og:site_name')
      let favicon = ''
      const iconHref = html.match(/<link[^>]*rel\s*=\s*["'](?:shortcut icon|icon|apple-touch-icon)[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i)?.[1]
        || html.match(/<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'](?:shortcut icon|icon|apple-touch-icon)[^"']*["']/i)?.[1]
        || ''
      favicon = abs(iconHref) || `${target.origin}/favicon.ico`
      res.json({ url: target.toString(), title: title.slice(0, 200), description: description.slice(0, 500), image, favicon, siteName: siteName.slice(0, 120), domain })
    } catch {
      res.json(fallback)
    }
  })

  // Templates
  app.get('/api/templates', (_req,res)=> {
    res.json([
      { id: uuid(), name:'Project', category:'Work', icon:'◈', description:'Kick off a new project' },
      { id: uuid(), name:'Meeting Notes', category:'Work', icon:'◐', description:'Structured notes' },
    ])
  })

  // AI stub
  app.post('/api/ai/generate', aiLimiter, async (req,res)=> {
    const parsed = z.object({
      prompt: z.string().min(1).max(MAX_AI_PROMPT),
      task: z.string().max(100).optional(),
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
    const { prompt, task } = parsed.data
    await new Promise(r=> setTimeout(r, 500))
    res.json({ result: `✨ [${task||'default'}] Simulated AI response for: "${String(prompt).slice(0,100)}"\n\nThis is a stub. Configure provider in Settings → AI.` })
  })
}

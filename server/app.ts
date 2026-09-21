import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { getCorsOrigin, generalLimiter, jwtSecretIsDefault } from './security.js'
import { registerWorkspaceRoutes } from './routes/workspaces.js'
import { registerPageRoutes } from './routes/pages.js'
import { registerBlockRoutes } from './routes/blocks.js'
import { registerDatabaseRoutes } from './routes/databases.js'
import { registerSharingRoutes } from './routes/sharing.js'
import { registerVersionRoutes } from './routes/versions.js'
import { registerSearchRoutes } from './routes/search.js'
import { registerCommentRoutes } from './routes/comments.js'
import { registerFileRoutes } from './routes/files.js'
import { registerActivityRoutes } from './routes/activities.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerNotificationRoutes } from './routes/notifications.js'
import { registerMiscRoutes } from './routes/misc.js'

dotenv.config()

export const app = express()
export const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.disable('x-powered-by')
// Trust one proxy hop (Render/Fly/Nginx) so rate limiting sees the real IP.
app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Editor embeds user images/video via blob:/data: URLs.
      'img-src': ["'self'", 'data:', 'blob:'],
      'media-src': ["'self'", 'data:', 'blob:'],
      // API + Yjs collab WS (VITE_COLLAB_URL) must be reachable in prod.
      'connect-src': ["'self'", 'https:', 'wss:', 'ws:', 'data:', 'blob:'],
    },
  },
}))
app.use(cors({ origin: getCorsOrigin() }))
app.use(express.json({ limit: '10mb' }))
app.use(generalLimiter)

if (process.env.NODE_ENV === 'production' && jwtSecretIsDefault()) {
  throw new Error('[security] JWT_SECRET is unset or default — set a long random value in production (e.g. `openssl rand -base64 48`).')
}

registerMiscRoutes(app) // /health first (no auth), then API routers
registerWorkspaceRoutes(app)
registerPageRoutes(app)
registerBlockRoutes(app)
registerDatabaseRoutes(app)
registerSharingRoutes(app)
registerVersionRoutes(app)
registerSearchRoutes(app)
registerCommentRoutes(app)
registerFileRoutes(app)
registerActivityRoutes(app)
registerAuthRoutes(app)
registerNotificationRoutes(app)

// Error handler
app.use((err:any,_req:any,res:any,_next:any)=> {
  console.error(err)
  res.status(500).json({ error:'Internal server error', details: String(err?.message||err) })
})

// Serve frontend in production
const distDir = path.join(__dirname,'..','dist')
app.use(express.static(distDir))
// SPA fallback for react-router deep links (/page/:id, /settings, …).
// Unknown /api/* paths stay JSON 404s; everything else serves index.html
// when a production build exists.
// NOTE: Express 5 removed `app.get('*')` (path-to-regexp v8) — `app.use`
// fallback works on both Express 4 and 5.
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' })
  // Only handle GETs for SPA fallback; other methods fall through to 404.
  if (req.method !== 'GET') return res.status(404).send('Not found')
  const indexFile = path.join(distDir, 'index.html')
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile)
  return res.status(404).send('Not found')
})

import fs from 'fs'
import path from 'path'

// Persistence: Postgres when DATABASE_URL is set, else JSON file (zero-setup dev).
// Run `npm run db:migrate` once to apply migrations/001 through 006.
const DB_PATH = path.join(process.cwd(), 'server', 'db.json')

export type DB = {
  users: any[]
  workspaces: any[]
  pages: any[]
  blocks: any[]
  databases: any[]
  records: any[]
  files: any[]
  comments: any[]
  activities: any[]
  notifications: any[]
  shares: any[]
  versions: any[]
}

function loadDB(): DB {
  try {
    if (fs.existsSync(DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
      if (!Array.isArray(parsed.notifications)) parsed.notifications = []
      return parsed
    }
  } catch {}
  return { users:[], workspaces:[], pages:[], blocks:[], databases:[], records:[], files:[], comments:[], activities:[], notifications:[], shares:[], versions:[] }
}

export let db: DB = loadDB()
if (!Array.isArray((db as any).shares)) (db as any).shares = []
if (!Array.isArray((db as any).notifications)) (db as any).notifications = []
if (!Array.isArray((db as any).versions)) (db as any).versions = []

export function saveDB() {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive:true }); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)) } catch(e){ console.error('saveDB', e)}
}

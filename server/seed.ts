// Seed: Postgres when DATABASE_URL is set, else server/db.json.
// Usage: npm run seed / npm run db:migrate (migrations first for Postgres)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'db.json')

async function main() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg')
    const { hashPassword } = await import('./auth.js')
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const email = 'alex@openmanas.app'
      const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email])
      let userId: string
      if (existing.rows[0]) {
        userId = existing.rows[0].id
        console.log('User exists:', email)
      } else {
        const hash = await hashPassword('password123')
        const u = await pool.query(
          'INSERT INTO users(email, name, password_hash) VALUES ($1,$2,$3) RETURNING id',
          [email, 'Alex Rivera', hash],
        )
        userId = u.rows[0].id
        console.log('Created user:', email, '(password: password123)')
      }
      const ws = await pool.query('SELECT id FROM workspaces WHERE name=$1', ['Acme Workspace'])
      if (!ws.rows[0]) {
        await pool.query('INSERT INTO workspaces(name, icon, owner_id) VALUES ($1,$2,$3)', ['Acme Workspace', '⬢', userId])
        console.log('Created workspace: Acme Workspace')
      } else {
        console.log('Workspace exists: Acme Workspace')
      }
    } finally {
      await pool.end()
    }
    return
  }
  const seed = {
    workspaces: [{ id:'w1', name:'Acme Workspace', icon:'⬢', ownerId:'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}],
    users: [{ id:'u1', email:'alex@openmanas.app', name:'Alex Rivera', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}],
    pages: [],
    blocks: [],
    databases: [],
    records: [],
    files: [],
    comments: [],
    activities: []
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive:true })
  fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2))
  console.log('Seeded', dbPath)
}

main().catch((e) => { console.error(e); process.exit(1) })

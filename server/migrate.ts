// Run SQL migrations against Postgres (DATABASE_URL).
// Usage: npm run db:migrate
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and set it.')
    process.exit(1)
  }
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: url })
  try {
    for (const file of ['001_initial.sql', '002_db_performance.sql', '002_page_theme.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf-8')
      console.log(`Applying ${file}...`)
      await pool.query(sql)
    }
    console.log('Migrations applied.')
  } finally {
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

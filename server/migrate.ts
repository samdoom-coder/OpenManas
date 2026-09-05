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
    // 004_pgvector.sql needs the pgvector extension; skipped with a warning
    // when the host doesn't provide it (semantic search still works client-side).
    for (const file of ['001_initial.sql', '002_db_performance.sql', '002_page_theme.sql', '003_derived.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf-8')
      console.log(`Applying ${file}...`)
      await pool.query(sql)
    }
    try {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '004_pgvector.sql'), 'utf-8')
      console.log('Applying 004_pgvector.sql...')
      await pool.query(sql)
    } catch (e) {
      console.warn('Skipping 004_pgvector.sql (pgvector unavailable):', String((e as Error)?.message || e))
    }
    console.log('Migrations applied.')
  } finally {
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

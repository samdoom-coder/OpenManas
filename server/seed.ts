import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'db.json')

const seed = {
  workspaces: [{ id:'w1', name:'Acme Workspace', icon:'⬢', ownerId:'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}],
  users: [{ id:'u1', email:'alex@nexus.so', name:'Alex Rivera', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}],
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

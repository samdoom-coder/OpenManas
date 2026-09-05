// Storage abstraction — supports S3, R2, Supabase, MinIO via same interface
export interface StorageProvider {
  id: string
  name: string
  upload(file: File): Promise<{ key: string; url: string }>
  download(key: string): Promise<Blob>
  delete(key: string): Promise<void>
  getUrl(key: string): string
}

const FILES_KEY = 'openmanas_files'
const LEGACY_FILES_KEY = 'nexus_files' // pre-rebrand — migrated on first write

function readMeta(): any[] {
  try {
    return JSON.parse(localStorage.getItem(FILES_KEY) ?? localStorage.getItem(LEGACY_FILES_KEY) ?? '[]')
  } catch {
    return []
  }
}
function writeMeta(meta: any[]) {
  localStorage.setItem(FILES_KEY, JSON.stringify(meta))
  try { localStorage.removeItem(LEGACY_FILES_KEY) } catch { /* noop */ }
}

class LocalStorageProvider implements StorageProvider {
  id = 'local'
  name = 'Browser Storage (dev)'
  async upload(file: File) {
    const key = `files/${Date.now()}-${file.name}`
    // create object URL for demo
    const url = URL.createObjectURL(file)
    // persist meta in localStorage
    const meta = readMeta()
    meta.push({ key, name: file.name, size: file.size, type: file.type, url })
    writeMeta(meta)
    return { key, url }
  }
  async download(key: string) {
    const meta = readMeta() as any[]
    const entry = meta.find(m => m.key === key)
    if (!entry) throw new Error('Not found')
    const res = await fetch(entry.url)
    return res.blob()
  }
  async delete(key: string) {
    const meta = readMeta() as any[]
    writeMeta(meta.filter(m => m.key !== key))
  }
  getUrl(key: string) {
    const meta = readMeta() as any[]
    return meta.find(m => m.key === key)?.url ?? ''
  }
}

// Stubs for future providers
class S3Provider implements StorageProvider {
  id = 's3'; name = 'AWS S3'
  async upload(_f: File): Promise<{ key: string; url: string }> { throw new Error('S3 not configured') }
  async download(_k: string): Promise<Blob> { throw new Error('S3 not configured') }
  async delete(_k: string): Promise<void> { throw new Error('S3 not configured') }
  getUrl(k: string) { return `https://s3.example.com/${k}` }
}

export class StorageService {
  private providers = new Map<string, StorageProvider>()
  private activeId = 'local'
  constructor() {
    this.register(new LocalStorageProvider())
    this.register(new S3Provider())
  }
  register(p: StorageProvider) { this.providers.set(p.id, p) }
  setActive(id: string) { if (this.providers.has(id)) this.activeId = id }
  getActive(): StorageProvider { return this.providers.get(this.activeId)! }
  list() { return Array.from(this.providers.values()) }
}

export const storageService = new StorageService()
